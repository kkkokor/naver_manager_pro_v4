import React, { useState } from 'react';
import { Campaign, AdGroup } from '../types';
import { naverService } from '../services/naverService';
import { Filter, Layers, Loader2, CheckCircle, List, FileText, Copy, PlusCircle, AlertTriangle } from 'lucide-react';

interface Props {
    campaigns: Campaign[];
}

export const KeywordExpander: React.FC<Props> = ({ campaigns }) => {
    const [mode, setMode] = useState<'simple' | 'batch'>('simple');

    // --- 공통 상태 ---
    const [selectedCampaign, setSelectedCampaign] = useState<string>('');
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resultLog, setResultLog] = useState<string[]>([]);
    
    // 생성된 그룹 알림용
    const [createdGroupLog, setCreatedGroupLog] = useState<string[]>([]);

    // --- Simple Mode 상태 ---
    const [regions, setRegions] = useState<string>('');
    const [mainKeywords, setMainKeywords] = useState<string>('');
    const [useAB, setUseAB] = useState<boolean>(true);
    const [useBA, setUseBA] = useState<boolean>(false);
    const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
    const [groupNameFilter, setGroupNameFilter] = useState<string>('');
    const [filteredGroups, setFilteredGroups] = useState<AdGroup[]>([]);
    const [targetGroupIds, setTargetGroupIds] = useState<Set<string>>(new Set());

    // --- Batch Mode 상태 ---
    const [mappingText, setMappingText] = useState<string>(''); 
    const [batchMainKeywords, setBatchMainKeywords] = useState<string>('');
    const [batchUseAB, setBatchUseAB] = useState<boolean>(true);
    const [batchUseBA, setBatchUseBA] = useState<boolean>(false);

    const handleCampaignChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const campId = e.target.value;
        setSelectedCampaign(campId);
        setGroupNameFilter('');
        setTargetGroupIds(new Set());
        setCreatedGroupLog([]);
        
        if (campId) {
            setIsLoadingGroups(true);
            try {
                const groups = await naverService.getAdGroups(campId);
                setAdGroups(groups);
                setFilteredGroups(groups); 
            } catch(e) { console.error(e); }
            setIsLoadingGroups(false);
        } else {
            setAdGroups([]);
            setFilteredGroups([]);
        }
    };

    const handleFilterGroups = () => {
        if (!groupNameFilter.trim()) {
            setFilteredGroups(adGroups);
            return;
        }
        const filtered = adGroups.filter(g => g.name.includes(groupNameFilter.trim()));
        setFilteredGroups(filtered);
        const newSet = new Set<string>();
        filtered.forEach(g => newSet.add(g.nccAdGroupId));
        setTargetGroupIds(newSet);
    };

    const handleCombineSimple = () => {
        const listA = regions.split('\n').map(s => s.trim()).filter(s => s);
        const listB = mainKeywords.split('\n').map(s => s.trim()).filter(s => s);
        if (listA.length === 0 || listB.length === 0) { alert("A/B 리스트를 입력하세요."); return; }
        const result: string[] = [];
        for (const a of listA) {
            for (const b of listB) {
                if (useAB) result.push(`${a}${b}`);
                if (useBA) result.push(`${b}${a}`);
            }
        }
        setGeneratedKeywords([...new Set(result)]);
    };

    const parseBatchData = () => {
        const mainKwds = batchMainKeywords.split('\n').map(s => s.trim()).filter(s => s);
        if (mainKwds.length === 0) { alert("공통 메인 키워드를 입력해주세요."); return null; }

        const lines = mappingText.split('\n').filter(l => l.trim());
        const tasks: { groupId: string, groupName: string, keywords: string[] }[] = [];
        const missingGroups: string[] = [];

        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length < 2) return;

            const groupNameTarget = parts[0].trim();
            const regionsStr = parts[1].trim();
            const regionList = regionsStr.split(/,|\t/).map(s => s.trim()).filter(s => s);

            // 정확도: 완전 일치 우선, 없으면 포함
            let targetGroup = adGroups.find(g => g.name === groupNameTarget);
            if (!targetGroup) targetGroup = adGroups.find(g => g.name.includes(groupNameTarget));

            if (targetGroup) {
                const keywords: string[] = [];
                regionList.forEach(region => {
                    mainKwds.forEach(main => {
                        if (batchUseAB) keywords.push(`${region}${main}`);
                        if (batchUseBA) keywords.push(`${main}${region}`);
                    });
                });
                tasks.push({ groupId: targetGroup.nccAdGroupId, groupName: targetGroup.name, keywords });
            } else {
                missingGroups.push(groupNameTarget);
            }
        });

        return { tasks, missingGroups };
    };

    const handleBatchPreview = () => {
        if (!selectedCampaign) { alert("캠페인을 먼저 선택해주세요."); return; }
        const result = parseBatchData();
        if (!result) return;
        
        const totalKwd = result.tasks.reduce((sum, t) => sum + t.keywords.length, 0);
        let msg = `[분석 결과]\n- 매칭된 그룹: ${result.tasks.length}개\n- 생성될 총 키워드: ${totalKwd}개\n`;
        if (result.missingGroups.length > 0) msg += `\n[주의] 그룹명 못 찾음:\n${result.missingGroups.join(', ')}`;
        alert(msg);
    };

    // [★핵심] 그룹의 소재와 확장소재를 새 그룹으로 복사하는 함수
    const copyGroupSettings = async (sourceGroupId: string, targetGroupId: string) => {
        setResultLog(prev => [`♻️ 원본 그룹(${sourceGroupId})의 세팅을 복사합니다...`, ...prev]);
        
        try {
            // 1. 소재(Ad) 복사
            const sourceAds = await naverService.getAds(undefined, sourceGroupId);
            let adCount = 0;
            for (const ad of sourceAds) {
                // 원본 소재 내용을 바탕으로 새 소재 생성
                try {
                    await naverService.createAd(targetGroupId, ad.headline, ad.description);
                    adCount++;
                } catch (e) {
                    console.error("소재 복사 실패:", e);
                }
            }
            setResultLog(prev => [`  L 소재 ${adCount}개 복사 완료`, ...prev]);

            // 2. 확장소재(Extensions) 복사
            // 서버에 구현된 '그룹별 확장소재 조회' 기능 사용
            const sourceExts = await naverService.getExtensionsByGroup(sourceGroupId);
            let extCount = 0;
            for (const ext of sourceExts) {
                try {
                    // 비즈채널형인지 일반형인지 구분하여 파라미터 구성
                    const businessChannelId = ext.pcChannelId || ext.mobileChannelId || undefined;
                    const attributes = ext.extension || {}; // 파싱된 JSON 객체 그대로 사용

                    await naverService.createExtension(targetGroupId, ext.type, businessChannelId, attributes);
                    extCount++;
                } catch (e) {
                    console.error(`확장소재(${ext.type}) 복사 실패:`, e);
                }
            }
            setResultLog(prev => [`  L 확장소재 ${extCount}개 복사 완료`, ...prev]);

        } catch (e) {
            console.error("그룹 세팅 복사 중 치명적 오류:", e);
            setResultLog(prev => [`❌ 그룹 복사 실패: ${e}`, ...prev]);
        }
    };

    // [핵심] 오버플로우 처리 (1000개 초과 시 그룹 분할)
    const processGroupOverflow = async (task: { groupId: string, groupName: string, keywords: string[] }) => {
        const MAX_LIMIT = 1000;
        
        // 1. 현재 그룹의 키워드 개수 확인
        const currentKwds = await naverService.getKeywords(task.groupId, 'MOBILE', 3);
        const currentCount = currentKwds.length;
        const remainingSpace = Math.max(0, MAX_LIMIT - currentCount);

        const results: { groupId: string, groupName: string, keywords: string[] }[] = [];

        // 2. 원본 그룹에 넣을 수 있는 만큼 넣기
        if (task.keywords.length <= remainingSpace) {
            results.push(task);
            return results;
        }

        // 3. 꽉 차서 넘치는 경우
        const toOriginal = task.keywords.slice(0, remainingSpace);
        if (toOriginal.length > 0) {
            results.push({ groupId: task.groupId, groupName: task.groupName, keywords: toOriginal });
        }

        let leftovers = task.keywords.slice(remainingSpace);
        let suffix = 1;

        // 4. 남은 키워드를 담을 새 그룹 생성 반복
        while (leftovers.length > 0) {
            const chunk = leftovers.slice(0, MAX_LIMIT);
            leftovers = leftovers.slice(MAX_LIMIT);

            // 새 그룹 이름 결정 (중복 피하기)
            let newGroupName = `${task.groupName}_${suffix}`;
            while (adGroups.find(g => g.name === newGroupName)) {
                suffix++;
                newGroupName = `${task.groupName}_${suffix}`;
            }

            try {
                // (1) 새 그룹 생성
                const newGroup = await naverService.createAdGroup(selectedCampaign, newGroupName);
                setCreatedGroupLog(prev => [`✨ 그룹 생성: ${newGroupName}`, ...prev]);
                
                // (2) [★중요] 원본 그룹의 소재/확장소재 복사
                await copyGroupSettings(task.groupId, newGroup.nccAdGroupId);

                // (3) 작업 목록에 추가
                results.push({ groupId: newGroup.nccAdGroupId, groupName: newGroup.name, keywords: chunk });
                
            } catch (e) {
                setResultLog(prev => [`❌ 그룹 생성 실패 (${newGroupName}): ${e}`, ...prev]);
                break; 
            }
            suffix++;
        }

        return results;
    };

    const executeSubmit = async (initialTasks: { groupId: string, groupName: string, keywords: string[] }[]) => {
        setIsSubmitting(true);
        setResultLog([]);
        setCreatedGroupLog([]);
        
        let successTotal = 0;
        
        // [1] 그룹별 용량 체크 및 분할 (순차 처리)
        const finalTasks: { adGroupId: string, keyword: string }[] = [];
        
        setResultLog(prev => ["🔄 그룹 용량 분석 및 자동 생성 중...", ...prev]);

        for (const task of initialTasks) {
            const processedTasks = await processGroupOverflow(task);
            processedTasks.forEach(pt => {
                pt.keywords.forEach(k => finalTasks.push({ adGroupId: pt.groupId, keyword: k }));
            });
        }

        // [2] 키워드 실제 등록
        const chunkSize = 100;
        for (let i = 0; i < finalTasks.length; i += chunkSize) {
            const batch = finalTasks.slice(i, i + chunkSize);
            try {
                const res = await naverService.createKeywordsBulk(batch);
                const success = res ? res.filter((r: any) => r.status === 'success').length : 0;
                successTotal += success;
                setResultLog(prev => [`키워드 등록 ${i}~${i+chunkSize}: ${success}개 완료`, ...prev.slice(0, 4)]);
            } catch (e) {
                console.error(e);
                setResultLog(prev => [`등록 ${i} 구간 에러`, ...prev]);
            }
        }

        setIsSubmitting(false);
        // 그룹 목록 갱신 (새로 생긴 그룹 반영)
        try {
            const groups = await naverService.getAdGroups(selectedCampaign);
            setAdGroups(groups);
        } catch(e) {}
        
        alert(`완료! 총 ${successTotal}개 키워드 등록.\n새로 생성된 그룹이 있다면 로그를 확인하세요.`);
    };

    const handleSubmitSimple = async () => {
        if (targetGroupIds.size === 0 || generatedKeywords.length === 0) return;
        if (!confirm(`선택한 ${targetGroupIds.size}개 그룹에 ${generatedKeywords.length}개씩 등록합니다.`)) return;

        const tasks: { groupId: string, groupName: string, keywords: string[] }[] = [];
        targetGroupIds.forEach(gid => {
            const grp = adGroups.find(g => g.nccAdGroupId === gid);
            if (grp) tasks.push({ groupId: gid, groupName: grp.name, keywords: generatedKeywords });
        });
        await executeSubmit(tasks);
    };

    const handleSubmitBatch = async () => {
        if (!selectedCampaign) return;
        const result = parseBatchData();
        if (!result || result.tasks.length === 0) { alert("매칭된 작업이 없습니다."); return; }

        const totalKwd = result.tasks.reduce((sum, t) => sum + t.keywords.length, 0);
        if (!confirm(`총 ${result.tasks.length}개 그룹에 ${totalKwd}개 키워드 등록을 시도합니다.\n(꽉 찬 그룹은 자동으로 새 그룹을 생성하고 소재를 복사합니다)`)) return;

        await executeSubmit(result.tasks);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">키워드 대량 생성</h2>
                
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setMode('simple')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${mode === 'simple' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                        <List className="w-4 h-4 inline mr-2"/>단순 조합
                    </button>
                    <button onClick={() => setMode('batch')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${mode === 'batch' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                        <FileText className="w-4 h-4 inline mr-2"/>일괄 매핑 (고급)
                    </button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <span className="font-bold text-gray-700 min-w-[80px]">대상 캠페인:</span>
                <select className="flex-1 border p-2 rounded focus:ring-2 focus:ring-naver-green outline-none" value={selectedCampaign} onChange={handleCampaignChange}>
                    <option value="">캠페인을 선택하세요</option>
                    {campaigns.map(c => <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>)}
                </select>
                {isLoadingGroups && <Loader2 className="animate-spin text-gray-400"/>}
            </div>
            
            {mode === 'simple' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center"><Layers className="w-5 h-5 mr-2"/> 1. 키워드 조합 설정</h3>
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <div className="flex flex-col"><label className="text-sm font-bold text-gray-700 mb-1">A 리스트 (지역)</label><textarea className="flex-1 border p-3 rounded bg-gray-50 text-sm resize-none" placeholder="파주&#13;&#10;일산" value={regions} onChange={e => setRegions(e.target.value)} /></div>
                            <div className="flex flex-col"><label className="text-sm font-bold text-gray-700 mb-1">B 리스트 (키워드)</label><textarea className="flex-1 border p-3 rounded bg-gray-50 text-sm resize-none" placeholder="변기막힘" value={mainKeywords} onChange={e => setMainKeywords(e.target.value)} /></div>
                        </div>
                        <div className="flex space-x-6 bg-gray-50 p-3 rounded"><label className="flex items-center"><input type="checkbox" checked={useAB} onChange={e => setUseAB(e.target.checked)} className="mr-2"/>A+B</label><label className="flex items-center"><input type="checkbox" checked={useBA} onChange={e => setUseBA(e.target.checked)} className="mr-2"/>B+A</label></div>
                        <button onClick={handleCombineSimple} className="w-full bg-gray-700 text-white py-2 rounded font-bold">조합 결과 생성</button>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center"><Filter className="w-5 h-5 mr-2"/> 2. 타겟 그룹 선택</h3>
                        <div className="flex gap-2"><input type="text" className="flex-1 border p-2 rounded" placeholder="그룹명 검색" value={groupNameFilter} onChange={e => setGroupNameFilter(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilterGroups()} disabled={!selectedCampaign} /><button onClick={handleFilterGroups} className="bg-gray-700 text-white px-3 rounded">검색</button></div>
                        <div className="flex-1 border rounded bg-gray-50 overflow-y-auto p-2 h-40">
                            {filteredGroups.map(g => (
                                <label key={g.nccAdGroupId} className="flex items-center p-1 cursor-pointer hover:bg-white"><input type="checkbox" checked={targetGroupIds.has(g.nccAdGroupId)} onChange={e => { const s = new Set(targetGroupIds); e.target.checked ? s.add(g.nccAdGroupId) : s.delete(g.nccAdGroupId); setTargetGroupIds(s); }} className="mr-2"/><span className="text-sm truncate">{g.name}</span></label>
                            ))}
                        </div>
                        <button onClick={handleSubmitSimple} disabled={isSubmitting || targetGroupIds.size === 0 || generatedKeywords.length === 0} className="w-full bg-naver-green text-white py-3 rounded-lg font-bold hover:bg-naver-dark disabled:bg-gray-300 flex justify-center items-center">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle className="mr-2 w-5 h-5"/>} 일괄 등록 실행
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center text-blue-600"><FileText className="w-5 h-5 mr-2"/> 1. 그룹별 매핑 규칙 (붙여넣기)</h3>
                        <div className="flex-1 flex flex-col">
                            <label className="text-sm text-gray-500 mb-1">형식: <b>그룹명 | 세부지역1, 세부지역2...</b></label>
                            <textarea 
                                className="flex-1 border p-4 rounded-lg bg-gray-50 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed" 
                                placeholder={`강남구 그룹 | 역삼동, 서초동, 신사동\n인천시 그룹 | 남동구, 계산동, 부평`}
                                value={mappingText} 
                                onChange={e => setMappingText(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center"><Layers className="w-5 h-5 mr-2"/> 2. 공통 키워드 & 실행</h3>
                        
                        <div className="flex-1 flex flex-col">
                            <label className="text-sm font-bold text-gray-700 mb-1">메인 키워드 (B)</label>
                            <textarea 
                                className="flex-1 border p-3 rounded bg-gray-50 text-sm resize-none focus:ring-2 focus:ring-naver-green outline-none h-32" 
                                placeholder="변기막힘" 
                                value={batchMainKeywords} 
                                onChange={e => setBatchMainKeywords(e.target.value)} 
                            />
                        </div>

                        <div className="bg-gray-50 p-3 rounded border border-gray-200">
                            <div className="flex gap-4">
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseAB} onChange={e => setBatchUseAB(e.target.checked)} className="mr-2"/>A + B</label>
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseBA} onChange={e => setBatchUseBA(e.target.checked)} className="mr-2"/>B + A</label>
                            </div>
                        </div>

                        <button onClick={handleBatchPreview} className="w-full bg-gray-700 text-white py-2 rounded font-bold hover:bg-gray-800">
                            매칭 결과 미리보기
                        </button>

                        <button onClick={handleSubmitBatch} disabled={isSubmitting} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-300 flex justify-center items-center shadow-md">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 w-5 h-5"/>} 
                            스마트 일괄 등록 (자동 확장)
                        </button>

                        {/* 로그 표시 영역 */}
                        {(createdGroupLog.length > 0 || resultLog.length > 0) && (
                            <div className="bg-gray-900 text-xs p-3 rounded h-32 overflow-y-auto font-mono">
                                {createdGroupLog.map((log, i) => <div key={`g-${i}`} className="text-yellow-400 mb-1">{log}</div>)}
                                {resultLog.map((log, i) => <div key={`r-${i}`} className="text-green-400">{log}</div>)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};