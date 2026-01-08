import React, { useState, useEffect } from 'react';
import { Campaign, AdGroup, BusinessChannel } from '../types';
import { naverService } from '../services/naverService';
import { Filter, Layers, Loader2, CheckCircle, List, FileText, PlusCircle } from 'lucide-react';

interface Props {
    campaigns: Campaign[];
}

export const KeywordExpander: React.FC<Props> = ({ campaigns }) => {
    const [mode, setMode] = useState<'simple' | 'batch'>('simple');

    // --- 상태 관리 ---
    const [selectedCampaign, setSelectedCampaign] = useState<string>('');
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resultLog, setResultLog] = useState<string[]>([]);
    const [createdGroupLog, setCreatedGroupLog] = useState<string[]>([]);
    
    // [비즈채널 상태]
    const [channels, setChannels] = useState<BusinessChannel[]>([]);
    const [selectedChannelId, setSelectedChannelId] = useState<string>('');

    // --- Simple Mode ---
    const [regions, setRegions] = useState<string>('');
    const [mainKeywords, setMainKeywords] = useState<string>('');
    const [useAB, setUseAB] = useState<boolean>(true);
    const [useBA, setUseBA] = useState<boolean>(false);
    // [추가] 메인 키워드 포함 옵션 (Simple Mode)
    const [includeMainSimple, setIncludeMainSimple] = useState<boolean>(false); 
    
    const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
    const [groupNameFilter, setGroupNameFilter] = useState<string>('');
    const [filteredGroups, setFilteredGroups] = useState<AdGroup[]>([]);
    const [targetGroupIds, setTargetGroupIds] = useState<Set<string>>(new Set());

    // --- Batch Mode ---
    const [mappingText, setMappingText] = useState<string>(''); 
    const [batchMainKeywords, setBatchMainKeywords] = useState<string>('');
    const [batchUseAB, setBatchUseAB] = useState<boolean>(true);
    const [batchUseBA, setBatchUseBA] = useState<boolean>(false);
    // [추가] 메인 키워드 포함 옵션 (Batch Mode)
    const [includeMainBatch, setIncludeMainBatch] = useState<boolean>(false);

    // [초기화] 비즈채널 목록 가져오기
    useEffect(() => {
        naverService.getChannels()
            .then(res => {
                console.log("[DEBUG] 불러온 채널 목록:", res);
                setChannels(res);
            })
            .catch(err => console.error("채널 로드 실패:", err));
    }, []);

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
        
        // [수정] Set을 사용하여 중복 제거 및 순서 보장
        const result = new Set<string>();

        // 1. 메인 키워드(B) 먼저 추가 (옵션 켜져있을 시)
        if (includeMainSimple) {
            listB.forEach(b => result.add(b));
        }

        // 2. 조합 추가
        for (const a of listA) {
            for (const b of listB) {
                if (useAB) result.add(`${a}${b}`);
                if (useBA) result.add(`${b}${a}`);
            }
        }
        setGeneratedKeywords(Array.from(result));
    };

    const parseBatchData = () => {
        const mainKwds = batchMainKeywords.split('\n').map(s => s.trim()).filter(s => s);
        if (mainKwds.length === 0) { alert("공통 메인 키워드를 입력해주세요."); return null; }

        const lines = mappingText.split('\n').filter(l => l.trim());
        const tasks: { groupId: string, groupName: string, keywords: string[] }[] = [];
        const missingGroups: string[] = [];

        lines.forEach(line => {
            const match = line.match(/(.+)\((.+)\)/); // 괄호로 구분
            if (!match) return;

            const groupNameTarget = match[1].trim(); // 괄호 앞부분이 그룹명
            const regionsStr = match[2].trim();      // 괄호 안쪽이 지역들
            const regionList = regionsStr.split(/,|\t/).map(s => s.trim()).filter(s => s);

            let targetGroup = adGroups.find(g => g.name === groupNameTarget);
            if (!targetGroup) targetGroup = adGroups.find(g => g.name.includes(groupNameTarget));

            if (targetGroup) {
                // [수정] Set 사용
                const keywordsSet = new Set<string>();
                
                // 1. 메인 키워드(B) 먼저 추가 (옵션 켜져있을 시)
                // (각 그룹마다 메인 키워드 추가 시도 -> 서버에서 중복 체크됨)
                if (includeMainBatch) {
                    mainKwds.forEach(main => keywordsSet.add(main));
                }

                // 2. 조합 추가
                regionList.forEach(region => {
                    mainKwds.forEach(main => {
                        if (batchUseAB) keywordsSet.add(`${region}${main}`);
                        if (batchUseBA) keywordsSet.add(`${main}${region}`);
                    });
                });
                tasks.push({ groupId: targetGroup.nccAdGroupId, groupName: targetGroup.name, keywords: Array.from(keywordsSet) });
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

    // [서버로 스마트 확장 요청]
    const executeSubmit = async (initialTasks: { groupId: string, groupName: string, keywords: string[] }[]) => {
        if (!selectedChannelId) {
            alert("비즈채널(웹사이트)을 반드시 선택해야 합니다! (그룹 생성 필수값)");
            return;
        }

        setIsSubmitting(true);
        setResultLog([]);
        setCreatedGroupLog([]);
        
        let successCount = 0;
        setResultLog(prev => ["🚀 스마트 확장 시작 (서버로 요청 전송)...", ...prev]);

        for (const task of initialTasks) {
            try {
                await naverService.smartExpand({
                    sourceGroupId: task.groupId,
                    keywords: task.keywords,
                    bidAmt: 70, 
                    businessChannelId: selectedChannelId 
                });
                
                successCount++;
                setResultLog(prev => [`✅ [${task.groupName}] 확장 요청 성공`, ...prev]);
            } catch (e) {
                console.error(e);
                setResultLog(prev => [`❌ [${task.groupName}] 실패: ${e}`, ...prev]);
            }
        }

        setIsSubmitting(false);
        alert(`작업 완료! 총 ${successCount}개 그룹 처리됨.`);
        
        if (selectedCampaign) {
            try {
                const groups = await naverService.getAdGroups(selectedCampaign);
                setAdGroups(groups);
            } catch(e) {}
        }
    };

    const handleSubmitSimple = async () => {
        if (targetGroupIds.size === 0 || generatedKeywords.length === 0) return;
        if (!selectedChannelId) { alert("비즈채널을 선택해주세요."); return; }
        
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
        if (!selectedChannelId) { alert("비즈채널을 선택해주세요."); return; }

        const result = parseBatchData();
        if (!result || result.tasks.length === 0) { alert("매칭된 작업이 없습니다."); return; }

        const totalKwd = result.tasks.reduce((sum, t) => sum + t.keywords.length, 0);
        if (!confirm(`총 ${result.tasks.length}개 그룹 실행. (비즈채널 ID 적용)`)) return;

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

                <span className="font-bold text-gray-700 min-w-[80px] ml-4">비즈채널:</span>
                <select 
                    className="flex-1 border p-2 rounded focus:ring-2 focus:ring-naver-green outline-none" 
                    value={selectedChannelId} 
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                >
                    <option value="">웹사이트를 선택하세요 (필수)</option>
                    {channels
                        .filter(ch => ch.type === 'SITE') 
                        .map(ch => (
                            <option key={ch.nccBusinessChannelId} value={ch.nccBusinessChannelId}>
                                {ch.name} ({ch.channelKey})
                            </option>
                        ))
                    }
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
                        <div className="flex space-x-6 bg-gray-50 p-3 rounded flex-wrap">
                            <label className="flex items-center"><input type="checkbox" checked={useAB} onChange={e => setUseAB(e.target.checked)} className="mr-2"/>A+B</label>
                            <label className="flex items-center"><input type="checkbox" checked={useBA} onChange={e => setUseBA(e.target.checked)} className="mr-2"/>B+A</label>
                            {/* [추가] 메인 키워드 포함 옵션 */}
                            <label className="flex items-center cursor-pointer">
                                <input type="checkbox" checked={includeMainSimple} onChange={e => setIncludeMainSimple(e.target.checked)} className="rounded text-red-600 focus:ring-red-500 mr-2"/>
                                <span className="text-sm font-bold text-red-600">메인 키워드(B) 포함</span>
                            </label>
                        </div>
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
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseAB} onChange={e => setBatchUseAB(e.target.checked)} className="mr-2"/>A + B</label>
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseBA} onChange={e => setBatchUseBA(e.target.checked)} className="mr-2"/>B + A</label>
                                {/* [추가] 메인 키워드 포함 옵션 */}
                                <label className="flex items-center cursor-pointer">
                                    <input type="checkbox" checked={includeMainBatch} onChange={e => setIncludeMainBatch(e.target.checked)} className="rounded text-red-600 focus:ring-red-500 mr-2"/>
                                    <span className="text-sm font-bold text-red-600">메인 키워드(B) 포함</span>
                                </label>
                            </div>
                        </div>

                        <button onClick={handleBatchPreview} className="w-full bg-gray-700 text-white py-2 rounded font-bold hover:bg-gray-800">
                            매칭 결과 미리보기
                        </button>

                        <button onClick={handleSubmitBatch} disabled={isSubmitting} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-300 flex justify-center items-center shadow-md">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 w-5 h-5"/>} 
                            스마트 일괄 등록 (자동 확장)
                        </button>

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