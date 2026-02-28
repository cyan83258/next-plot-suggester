/**
 * 다음 전개 추천 확장 프로그램 - 요청 큐
 *
 * Perf 5: 동시 다발적 생성 요청을 큐에 넣고 순차 처리
 * Perf 3: AbortController 통합 — 취소 시 현재 요청 + 큐 클리어
 *
 * 사용법:
 *   const result = await requestQueue.enqueue(asyncTask);
 *   requestQueue.cancel(); // 현재 요청 취소 + 큐 비우기
 */

import { log } from "./utils.js";

class RequestQueue {
    constructor() {
        /** @type {Array<{task: Function, resolve: Function, reject: Function}>} */
        this.queue = [];
        this.processing = false;
        /** @type {AbortController|null} */
        this.currentAbortController = null;
    }

    /**
     * 비동기 태스크를 큐에 추가
     * @param {Function} task - (abortSignal) => Promise 형태의 비동기 함수
     * @returns {Promise} 태스크 완료 시 결과 반환
     */
    enqueue(task) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.queue.push({ task: task, resolve: resolve, reject: reject });
            if (!self.processing) {
                self._processNext();
            }
        });
    }

    /** 내부: 큐에서 다음 태스크 처리 */
    async _processNext() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const item = this.queue.shift();

        // AbortController 생성
        this.currentAbortController = new AbortController();
        const signal = this.currentAbortController.signal;

        try {
            const result = await item.task(signal);
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        } finally {
            this.currentAbortController = null;
            // 다음 태스크 처리
            this._processNext();
        }
    }

    /**
     * 현재 요청 취소 + 큐 비우기
     * @param {string} [reason] - 취소 사유
     */
    cancel(reason) {
        const cancelMsg = reason || "사용자가 생성을 취소했습니다.";

        // 현재 실행 중인 요청 취소
        if (this.currentAbortController) {
            this.currentAbortController.abort(cancelMsg);
            this.currentAbortController = null;
        }

        // 큐에 대기 중인 모든 태스크 reject
        const pending = this.queue.splice(0, this.queue.length);
        for (let i = 0; i < pending.length; i++) {
            pending[i].reject(new DOMException(cancelMsg, "AbortError"));
        }

        this.processing = false;
        log("Request queue cancelled:", cancelMsg);
    }

    /**
     * 현재 AbortSignal 반환 (외부에서 취소 상태 확인용)
     * @returns {AbortSignal|null}
     */
    get currentSignal() {
        return this.currentAbortController ? this.currentAbortController.signal : null;
    }

    /**
     * 큐 상태
     * @returns {{ processing: boolean, pending: number }}
     */
    get status() {
        return {
            processing: this.processing,
            pending: this.queue.length
        };
    }
}

/** 싱글턴 인스턴스 */
export const requestQueue = new RequestQueue();
