import React, { useState } from 'react';
import { Campaign, AdGroup } from '../types';
import { naverService } from '../services/naverService';
import { Filter, Layers, Loader2, CheckCircle, ArrowRight, List, FileText } from 'lucide-react';

interface Props {
    campaigns: Campaign[];
}

export const KeywordExpander: React.FC<Props> = ({ campaigns }) => {
    // 탭 상태: 'simple' (기존 단순 조합), 'batch' (일괄 매핑)
    const [mode, setMode] = useState<'simple' | 'batch'>('simple');

    // --- 공통 상태 ---
    const [selectedCampaign, setSelectedCampaign] = useState<string>('');
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resultLog, setResultLog] = useState<string[]>([]);

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
    const [mappingText, setMappingText] = useState<string>(''); // 그룹명 | 키워드, 키워드...
    const [batchMainKeywords, setBatchMainKeywords] = useState<string>('');
    const [batchUseAB, setBatchUseAB] = useState<boolean>(true);
    const [batchUseBA, setBatchUseBA] = useState<boolean>(false);

    // 캠페인 변경 및 그룹 로딩
    const handleCampaignChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const campId = e.target.value;
        setSelectedCampaign(campId);
        setGroupNameFilter('');
        setTargetGroupIds(new Set());
        
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

    // --- Simple Mode Logic ---
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

    // --- Batch Mode Logic ---
    const parseBatchData = () => {
        const mainKwds = batchMainKeywords.split('\n').map(s => s.trim()).filter(s => s);
        if (mainKwds.length === 0) {
            alert("공통 메인 키워드를 입력해주세요.");
            return null;
        }

        const lines = mappingText.split('\n').filter(l => l.trim());
        const tasks: { groupId: string, groupName: string, keywords: string[] }[] = [];
        const missingGroups: string[] = [];

        lines.forEach(line => {
            // 포맷: 그룹명 | 지역1, 지역2, 지역3
            const parts = line.split('|');
            if (parts.length < 2) return;

            const groupNameTarget = parts[0].trim();
            const regionsStr = parts[1].trim();
            const regionList = regionsStr.split(/,|\t/).map(s => s.trim()).filter(s => s); // 콤마나 탭으로 분리

            // 그룹 찾기 (정확히 일치하거나 포함되는지)
            // 정확도 위해: 우선 정확 일치 찾고, 없으면 포함된 거 찾기
            let targetGroup = adGroups.find(g => g.name === groupNameTarget);
            if (!targetGroup) {
                targetGroup = adGroups.find(g => g.name.includes(groupNameTarget));
            }

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
        if (result.missingGroups.length > 0) {
            msg += `\n[주의] 다음 그룹명을 찾을 수 없습니다:\n${result.missingGroups.join(', ')}`;
        }
        alert(msg);
    };

    // --- Common Submit ---
    const executeSubmit = async (bulkItems: { adGroupId: string, keyword: string }[]) => {
        setIsSubmitting(true);
        setResultLog([]);
        
        const chunkSize = 100;
        let successTotal = 0;
        
        for (let i = 0; i < bulkItems.length; i += chunkSize) {
            const batch = bulkItems.slice(i, i + chunkSize);
            try {
                const res = await naverService.createKeywordsBulk(batch);
                const success = res ? res.filter((r: any) => r.status === 'success').length : 0;
                successTotal += success;
                setResultLog(prev => [`배치 ${i}~${i+chunkSize}: ${success}개 성공`, ...prev.slice(0, 4)]);
            } catch (e) {
                console.error(e);
                setResultLog(prev => [`배치 ${i} 에러 발생`, ...prev]);
            }
        }
        setIsSubmitting(false);
        alert(`총 ${successTotal}개 키워드 등록 완료!`);
    };

    const handleSubmitSimple = async () => {
        if (targetGroupIds.size === 0 || generatedKeywords.length === 0) return;
        if (!confirm(`선택한 ${targetGroupIds.size}개 그룹에 ${generatedKeywords.length}개씩 등록합니다.`)) return;

        const bulkItems: { adGroupId: string, keyword: string }[] = [];
        targetGroupIds.forEach(gid => {
            generatedKeywords.forEach(kwd => bulkItems.push({ adGroupId: gid, keyword: kwd }));
        });
        await executeSubmit(bulkItems);
    };

    const handleSubmitBatch = async () => {
        if (!selectedCampaign) return;
        const result = parseBatchData();
        if (!result || result.tasks.length === 0) { alert("매칭된 작업이 없습니다."); return; }

        const totalKwd = result.tasks.reduce((sum, t) => sum + t.keywords.length, 0);
        if (!confirm(`총 ${result.tasks.length}개 그룹에 ${totalKwd}개 키워드를 등록합니다.\n진행하시겠습니까?`)) return;

        const bulkItems: { adGroupId: string, keyword: string }[] = [];
        result.tasks.forEach(t => {
            t.keywords.forEach(kwd => bulkItems.push({ adGroupId: t.groupId, keyword: kwd }));
        });
        await executeSubmit(bulkItems);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">키워드 대량 생성</h2>
                
                {/* 모드 전환 탭 */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setMode('simple')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${mode === 'simple' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                        <List className="w-4 h-4 inline mr-2"/>단순 조합
                    </button>
                    <button onClick={() => setMode('batch')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${mode === 'batch' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                        <FileText className="w-4 h-4 inline mr-2"/>일괄 매핑 (고급)
                    </button>
                </div>
            </div>

            {/* 공통: 캠페인 선택 */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <span className="font-bold text-gray-700 min-w-[80px]">대상 캠페인:</span>
                <select className="flex-1 border p-2 rounded focus:ring-2 focus:ring-naver-green outline-none" value={selectedCampaign} onChange={handleCampaignChange}>
                    <option value="">캠페인을 선택하세요 (그룹 정보 로딩용)</option>
                    {campaigns.map(c => <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>)}
                </select>
                {isLoadingGroups && <Loader2 className="animate-spin text-gray-400"/>}
            </div>
            
            {mode === 'simple' ? (
                // --- Simple Mode UI (기존) ---
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
                // --- Batch Mode UI (신규) ---
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                    {/* 매핑 규칙 입력 */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center text-blue-600"><FileText className="w-5 h-5 mr-2"/> 1. 그룹별 매핑 규칙 (붙여넣기)</h3>
                        <div className="flex-1 flex flex-col">
                            <label className="text-sm text-gray-500 mb-1">아래 형식으로 입력: <b>그룹명 | 세부지역1, 세부지역2...</b></label>
                            <textarea 
                                className="flex-1 border p-4 rounded-lg bg-gray-50 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed" 
                                placeholder={`강남구 그룹 | 역삼동, 서초동, 신사동\n인천시 그룹 | 남동구, 계산동, 부평\n마포구 그룹 | 합정, 홍대`}
                                value={mappingText} 
                                onChange={e => setMappingText(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 키워드 및 실행 */}
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg border-b pb-2 flex items-center"><Layers className="w-5 h-5 mr-2"/> 2. 공통 키워드 & 실행</h3>
                        
                        <div className="flex-1 flex flex-col">
                            <label className="text-sm font-bold text-gray-700 mb-1">메인 키워드 (B)</label>
                            <textarea 
                                className="flex-1 border p-3 rounded bg-gray-50 text-sm resize-none focus:ring-2 focus:ring-naver-green outline-none h-32" 
                                placeholder="변기막힘&#13;&#10;뚫는곳" 
                                value={batchMainKeywords} 
                                onChange={e => setBatchMainKeywords(e.target.value)} 
                            />
                        </div>

                        <div className="bg-gray-50 p-3 rounded border border-gray-200">
                            <span className="text-xs font-bold text-gray-500 block mb-2">조합 방식 (지역명 + 키워드)</span>
                            <div className="flex gap-4">
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseAB} onChange={e => setBatchUseAB(e.target.checked)} className="mr-2"/>A + B</label>
                                <label className="flex items-center text-sm cursor-pointer"><input type="checkbox" checked={batchUseBA} onChange={e => setBatchUseBA(e.target.checked)} className="mr-2"/>B + A</label>
                            </div>
                        </div>

                        <button onClick={handleBatchPreview} className="w-full bg-gray-700 text-white py-2 rounded font-bold hover:bg-gray-800">
                            매칭 결과 미리보기 (검증)
                        </button>

                        <button onClick={handleSubmitBatch} disabled={isSubmitting} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-300 flex justify-center items-center shadow-md">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle className="mr-2 w-5 h-5"/>} 
                            전체 일괄 등록
                        </button>

                        {resultLog.length > 0 && (
                            <div className="bg-gray-900 text-green-400 text-xs p-3 rounded h-20 overflow-y-auto font-mono">
                                {resultLog.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};