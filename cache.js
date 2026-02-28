/**
 * 다음 전개 추천 확장 프로그램 - 영구 캐시 (IndexedDB + LRU)
 *
 * Perf 4: IndexedDB 기반 영구 캐시
 * Perf 8: 컨텍스트 해시 기반 diff (해시 저장/비교)
 *
 * - IndexedDB 사용 불가 시 메모리 캐시로 자동 폴백
 * - LRU eviction (최대 50개)
 * - TTL 지원 (기본 10분)
 */

import { log } from "./utils.js";

const DB_NAME = "nps-suggestion-cache";
const DB_VERSION = 1;
const STORE_SUGGESTIONS = "suggestions";
const STORE_CONTEXT_HASH = "contextHashes";
const MAX_ENTRIES = 50;
const DEFAULT_TTL = 10 * 60 * 1000; // 10분

// ═══════════════════════════════════════════
// IndexedDB 캐시
// ═══════════════════════════════════════════

let db = null;
let dbReady = false;
let dbFailed = false;

// 메모리 폴백
const memoryCache = new Map();
const memoryContextHashes = new Map();

/** DB 초기화 */
async function initDB() {
    if (dbReady || dbFailed) return;

    try {
        db = await new Promise(function (resolve, reject) {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_SUGGESTIONS)) {
                    const store = database.createObjectStore(STORE_SUGGESTIONS, { keyPath: "key" });
                    store.createIndex("timestamp", "timestamp", { unique: false });
                }
                if (!database.objectStoreNames.contains(STORE_CONTEXT_HASH)) {
                    database.createObjectStore(STORE_CONTEXT_HASH, { keyPath: "source" });
                }
            };

            request.onsuccess = function (event) {
                resolve(event.target.result);
            };

            request.onerror = function (event) {
                reject(event.target.error);
            };
        });

        dbReady = true;
        log("IndexedDB cache initialized");
    } catch (e) {
        dbFailed = true;
        log("IndexedDB unavailable, using memory fallback:", e.message);
    }
}

/** IDB 트랜잭션 헬퍼 */
function idbTransaction(storeName, mode) {
    if (!db) return null;
    try {
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    } catch (e) {
        log("IDB transaction error:", e.message);
        return null;
    }
}

/** IDB 비동기 래퍼 */
function idbRequest(request) {
    return new Promise(function (resolve, reject) {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
    });
}

// ═══════════════════════════════════════════
// 추천 캐시 API
// ═══════════════════════════════════════════

/**
 * 캐시에서 추천 가져오기
 * @param {string} key - 캐시 키
 * @param {number} [ttl] - 유효 시간 (ms)
 * @returns {Promise<Array|null>}
 */
export async function cacheGet(key, ttl) {
    if (!key) return null;
    if (ttl === undefined) ttl = DEFAULT_TTL;

    await initDB();

    if (dbReady) {
        try {
            const store = idbTransaction(STORE_SUGGESTIONS, "readonly");
            if (store) {
                const record = await idbRequest(store.get(key));
                if (record && (Date.now() - record.timestamp) < ttl) {
                    // 접근 시간 갱신 (LRU)
                    touchEntry(key);
                    return record.suggestions;
                }
            }
        } catch (e) {
            log("Cache get error:", e.message);
        }
    }

    // 메모리 폴백
    const mem = memoryCache.get(key);
    if (mem && (Date.now() - mem.timestamp) < ttl) {
        return mem.suggestions;
    }
    return null;
}

/**
 * 캐시에 추천 저장
 * @param {string} key - 캐시 키
 * @param {Array} suggestions - 추천 목록
 */
export async function cacheSet(key, suggestions) {
    if (!key || !suggestions) return;

    const record = {
        key: key,
        suggestions: suggestions,
        timestamp: Date.now()
    };

    await initDB();

    if (dbReady) {
        try {
            const store = idbTransaction(STORE_SUGGESTIONS, "readwrite");
            if (store) {
                await idbRequest(store.put(record));
                await evictIfNeeded();
            }
        } catch (e) {
            log("Cache set error:", e.message);
        }
    }

    // 메모리에도 저장 (폴백 + 빠른 접근)
    memoryCache.set(key, record);
    evictMemoryIfNeeded();
}

/**
 * 특정 키 캐시 무효화
 */
export async function cacheInvalidate(key) {
    if (key) {
        memoryCache.delete(key);
        if (dbReady) {
            try {
                const store = idbTransaction(STORE_SUGGESTIONS, "readwrite");
                if (store) await idbRequest(store.delete(key));
            } catch (e) { /* ignore */ }
        }
    }
}

/**
 * 전체 캐시 클리어
 */
export async function cacheClear() {
    memoryCache.clear();
    if (dbReady) {
        try {
            const store = idbTransaction(STORE_SUGGESTIONS, "readwrite");
            if (store) await idbRequest(store.clear());
        } catch (e) { /* ignore */ }
    }
}

/** LRU 접근 시간 갱신 */
function touchEntry(key) {
    if (!dbReady) return;
    try {
        const store = idbTransaction(STORE_SUGGESTIONS, "readwrite");
        if (!store) return;
        const req = store.get(key);
        req.onsuccess = function () {
            if (req.result) {
                req.result.timestamp = Date.now();
                store.put(req.result);
            }
        };
    } catch (e) { /* ignore */ }
}

/** LRU eviction (IDB) */
async function evictIfNeeded() {
    if (!dbReady) return;
    try {
        const store = idbTransaction(STORE_SUGGESTIONS, "readwrite");
        if (!store) return;

        const countReq = store.count();
        const count = await idbRequest(countReq);

        if (count <= MAX_ENTRIES) return;

        // timestamp 인덱스로 가장 오래된 항목 삭제
        const idx = store.index("timestamp");
        const toDelete = count - MAX_ENTRIES;
        const cursor = idx.openCursor();

        await new Promise(function (resolve) {
            let deleted = 0;
            cursor.onsuccess = function (event) {
                const c = event.target.result;
                if (c && deleted < toDelete) {
                    c.delete();
                    deleted++;
                    c.continue();
                } else {
                    resolve();
                }
            };
            cursor.onerror = function () { resolve(); };
        });
    } catch (e) {
        log("Eviction error:", e.message);
    }
}

/** 메모리 캐시 LRU eviction */
function evictMemoryIfNeeded() {
    if (memoryCache.size <= MAX_ENTRIES) return;

    // Map은 삽입 순서 유지 → 가장 오래된 것부터 삭제
    const toDelete = memoryCache.size - MAX_ENTRIES;
    const keys = memoryCache.keys();
    for (let i = 0; i < toDelete; i++) {
        const next = keys.next();
        if (!next.done) memoryCache.delete(next.value);
    }
}

// ═══════════════════════════════════════════
// 컨텍스트 해시 저장 (Perf 8)
// ═══════════════════════════════════════════

/**
 * 컨텍스트 소스의 해시를 저장/비교
 * @param {string} source - 소스 이름 (charDesc, worldInfo 등)
 * @param {string} newHash - 새 해시
 * @returns {Promise<boolean>} 변경 여부 (true = 변경됨)
 */
export async function hasContextChanged(source, newHash) {
    await initDB();

    // IDB에서 이전 해시 조회
    let oldHash = null;
    if (dbReady) {
        try {
            const store = idbTransaction(STORE_CONTEXT_HASH, "readonly");
            if (store) {
                const record = await idbRequest(store.get(source));
                if (record) oldHash = record.hash;
            }
        } catch (e) { /* ignore */ }
    }

    // 메모리 폴백
    if (oldHash === null) {
        oldHash = memoryContextHashes.get(source) || null;
    }

    const changed = oldHash !== newHash;

    // 새 해시 저장
    if (changed) {
        memoryContextHashes.set(source, newHash);
        if (dbReady) {
            try {
                const wStore = idbTransaction(STORE_CONTEXT_HASH, "readwrite");
                if (wStore) await idbRequest(wStore.put({ source: source, hash: newHash }));
            } catch (e) { /* ignore */ }
        }
    }

    return changed;
}

/**
 * 컨텍스트 해시 전체 리셋
 */
export async function resetContextHashes() {
    memoryContextHashes.clear();
    if (dbReady) {
        try {
            const store = idbTransaction(STORE_CONTEXT_HASH, "readwrite");
            if (store) await idbRequest(store.clear());
        } catch (e) { /* ignore */ }
    }
}
