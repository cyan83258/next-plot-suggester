// Compare human ratings for the same fixed cases. Never invent literary quality scores.
import fs from "node:fs";
import assert from "node:assert/strict";
const dimensions=["continuity","motivation","interest","freshness","usability"];
export function compareRatings(before,after){
    const records=data=>Array.isArray(data)?data:data.cases||[];
    const group=data=>{
        const grouped=new Map();
        for(const item of records(data)){
            const id=item.caseId||item.scene;
            if(!id||!dimensions.every(k=>Number.isFinite(Number(item.ratings?.[k]))&&Number(item.ratings[k])>=1&&Number(item.ratings[k])<=5))continue;
            const list=grouped.get(id)||[];list.push(item);grouped.set(id,list);
        }
        return grouped;
    };
    const a=group(before),b=group(after),cases=[];
    for(const[id,old]of a){
        const current=b.get(id);if(!current)continue;
        const average=(list,k)=>list.reduce((sum,item)=>sum+Number(item.ratings[k]),0)/list.length;
        const scores=Object.fromEntries(dimensions.map(k=>{const baseline=average(old,k),improved=average(current,k);return[k,{before:+baseline.toFixed(2),after:+improved.toFixed(2),delta:+(improved-baseline).toFixed(2)}];}));
        cases.push({caseId:id,beforeCount:old.length,afterCount:current.length,scores});
    }
    return {matchedCases:cases.length,unmatchedBefore:[...a.keys()].filter(id=>!b.has(id)),unmatchedAfter:[...b.keys()].filter(id=>!a.has(id)),cases,note:"사람이 매긴 점수 비교입니다. 동일 장면·모델·설정에서 여러 번 비교하고 비용과 지연도 함께 확인하세요."};
}
if(process.argv.includes("--self-test")){
    const ratings=Object.fromEntries(dimensions.map(k=>[k,3])),sample=compareRatings([{caseId:"one",ratings}],[{caseId:"one",ratings:{...ratings,interest:4}}]);
    assert.equal(sample.matchedCases,1);assert.equal(sample.cases[0].scores.interest.delta,1);
    assert.equal(compareRatings([{caseId:"missing",ratings}],[]).matchedCases,0);
    console.log("2/2 quality comparison checks passed");
}else if(process.argv[2]&&process.argv[3]){
    console.log(JSON.stringify(compareRatings(JSON.parse(fs.readFileSync(process.argv[2],"utf8")),JSON.parse(fs.readFileSync(process.argv[3],"utf8"))),null,2));
}else{console.error("Usage: node tests/compare-quality.mjs before.json after.json (or --self-test)");process.exitCode=1;}
