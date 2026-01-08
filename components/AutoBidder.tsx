import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Campaign, Keyword, AdGroup } from '../types';
import { Play, Settings2, Loader2, StopCircle, Clock, Target, List, Zap, Plus, X, Search, CheckSquare, Square, Eye, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { naverService, LogItem } from '../services/naverService';

interface BidAdjustmentResult {
  keywordId: string;
  keyword: string;
  oldBid: number;
  newBid: number;
  reason: string;
}

interface AutoBidderProps {
  campaigns: Campaign[];
  keywords: Keyword[];
  adGroups: AdGroup[];
  onRefresh: () => void;
}

// [최적화] 캠페인 리스트 아이템
const CampaignItem = React.memo(({ 
    c, 
    expandedCampaigns, 
    selectedGroupIds, 
    loadedGroupsMap, 
    toggleExpand, 
    toggleCampaignSelection, 
    toggleGroupSelection,
    isRunning,
    isCurrentRunning 
}: any) => {
    const loadedGroups = loadedGroupsMap[c.nccCampaignId] || [];
    const allGroupIds = loadedGroups.map((g: any) => g.nccAdGroupId);
    const selectedCount = allGroupIds.filter((id: string) => selectedGroupIds.includes(id)).length;
    const isAllSelected = loadedGroups.length > 0 && selectedCount === loadedGroups.length;
    const isPartialSelected = selectedCount > 0 && !isAllSelected;
    const isExpanded = expandedCampaigns.includes(c.nccCampaignId);

    return (
        <div className="border-b border-gray-50 last:border-0">
            <div className={`flex items-center p-2 rounded hover:bg-gray-50 transition-colors ${isCurrentRunning ? 'bg-green-50 ring-1 ring-green-200' : ''}`}>
                <button onClick={() => toggleExpand(c.nccCampaignId)} className="p-1 hover:bg-gray-200 rounded mr-1">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>}
                </button>
                
                <div onClick={() => !isRunning && toggleCampaignSelection(c.nccCampaignId)} className="cursor-pointer mr-2">
                    {isAllSelected ? <CheckSquare className="w-4 h-4 text-naver-green"/> : 
                        isPartialSelected ? <div className="w-4 h-4 bg-green-200 rounded-sm flex items-center justify-center"><div className="w-2 h-2 bg-naver-green rounded-full"></div></div> : 
                        <Square className="w-4 h-4 text-gray-300"/>}
                </div>

                <span className="font-bold text-sm flex-1 truncate select-none cursor-pointer" onClick={() => toggleExpand(c.nccCampaignId)}>{c.name}</span>
                {isCurrentRunning && <Loader2 className="w-3 h-3 animate-spin text-green-600"/>}
            </div>

            {isExpanded && (
                <div className="pl-9 pr-2 pb-2 space-y-0.5 animate-fadeIn">
                    {loadedGroups.length === 0 ? (
                        <div className="text-xs text-gray-400 py-1 flex items-center"><Loader2 className="w-3 h-3 animate-spin mr-1"/> 그룹 로딩 중...</div>
                    ) : (
                        loadedGroups.map((g: any) => (
                            <div key={g.nccAdGroupId} 
                                    onClick={() => !isRunning && toggleGroupSelection(g.nccAdGroupId)}
                                    className={`flex items-center p-1.5 rounded cursor-pointer hover:bg-gray-100 text-xs ${selectedGroupIds.includes(g.nccAdGroupId) ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-500'}`}
                            >
                                {selectedGroupIds.includes(g.nccAdGroupId) ? <CheckSquare className="w-3 h-3 mr-2 text-blue-500"/> : <Square className="w-3 h-3 mr-2 text-gray-300"/>}
                                <span className="truncate flex-1">{g.name}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
});

export const AutoBidder: React.FC<AutoBidderProps> = ({ campaigns }) => {
  const [mode, setMode] = useState<'CAMPAIGN' | 'SNIPER'>('CAMPAIGN');

  // --- [설정 값] ---
  const [targetRank, setTargetRank] = useState<number>(3);
  const [rankedMaxBid, setRankedMaxBid] = useState<number>(30000); 
  const [probeMaxBid, setProbeMaxBid] = useState<number>(7000);    
  const [bidStep, setBidStep] = useState<number>(1000);
  const [minImpression, setMinImpression] = useState<number>(30);
  const [loopInterval, setLoopInterval] = useState<number>(10); 
  const [targetDevice, setTargetDevice] = useState<string>('MOBILE'); 

  // --- [실행 상태] ---
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const isRunningRef = useRef<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [logs, setLogs] = useState<BidAdjustmentResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('대기 중...');
  const [nextRunTime, setNextRunTime] = useState<Date | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [expandedCampaigns, setExpandedCampaigns] = useState<string[]>([]);
  const [loadedGroupsMap, setLoadedGroupsMap] = useState<Record<string, AdGroup[]>>({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  
  const [currentCampaignIndex, setCurrentCampaignIndex] = useState<number>(-1);
  const [processingGroups, setProcessingGroups] = useState<string[]>([]); 

  const [sniperKeywords, setSniperKeywords] = useState<Keyword[]>([]); 
  const [keywordSearchQuery, setKeywordSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Keyword[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentSniperIndex, setCurrentSniperIndex] = useState<number>(-1);

useEffect(() => {
    return () => {
        console.log("페이지 이동: 자동 입찰 루프를 종료합니다.");
        isRunningRef.current = false; // 이 한 줄이 유령 작업을 막습니다.
    };
}, []);

  // [최적화] 함수 재생성 방지
  const toggleExpand = useCallback(async (campId: string) => {
    setExpandedCampaigns(prev => {
        if (prev.includes(campId)) return prev.filter(id => id !== campId);
        return [...prev, campId];
    });

    setLoadedGroupsMap(prev => {
        if (!prev[campId]) {
             naverService.getAdGroups(campId).then(groups => {
                setLoadedGroupsMap(current => ({ ...current, [campId]: groups }));
             }).catch(console.error);
        }
        return prev;
    });
  }, []);

  const toggleCampaignSelection = useCallback((campId: string) => {
      setLoadedGroupsMap(prevMap => {
          const groups = prevMap[campId];
          if (!groups) {
               naverService.getAdGroups(campId).then(fetchedGroups => {
                   setLoadedGroupsMap(curr => ({ ...curr, [campId]: fetchedGroups }));
               });
               return prevMap;
          }
          const groupIds = groups.map(g => g.nccAdGroupId);
          setSelectedGroupIds(prevSelected => {
              const allSelected = groupIds.every(id => prevSelected.includes(id));
              if (allSelected) return prevSelected.filter(id => !groupIds.includes(id));
              else return [...new Set([...prevSelected, ...groupIds])];
          });
          return prevMap;
      });
  }, []);

  const toggleGroupSelection = useCallback((groupId: string) => {
      setSelectedGroupIds(prev => 
          prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
      );
  }, []);

  useEffect(() => { return () => { if (loopTimerRef.current) clearTimeout(loopTimerRef.current); }; }, []);

  const stopAutoBid = () => {
      setIsLooping(false);
      setIsRunning(false);
      setNextRunTime(null);
      setCurrentCampaignIndex(-1);
      setCurrentSniperIndex(-1);
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      setStatusMessage("⛔ 중단됨.");
  };

  const calculateBidLogic = (kw: Keyword) => {
      let newBid = kw.bidAmt;
      let reason = '';
      const estimates = kw.bidEstimates || [];
      const targetEstimate = estimates.find(e => e.rank === targetRank);
      const currentRank = kw.currentRankEstimate;
      const currentImp = kw.stats.impressions || 0;

      let estimateApplied = false;
      if (targetEstimate && targetEstimate.bid > 70) {
          newBid = targetEstimate.bid;
          const diff = newBid - kw.bidAmt;
          reason = `🎯예상가(${targetRank}위) ${diff>0?'▲':'▼'}${Math.abs(diff)}`;
          estimateApplied = true;
      }
      if (!estimateApplied) {
          if (currentRank === 0) {
              if (kw.bidAmt < probeMaxBid) {
                newBid += bidStep;
                 if (newBid > probeMaxBid) newBid = probeMaxBid;
                  reason = '🔍탐색(증액)';
                }
              else reason = '⚠️동결(순위없음/고액)';
          } 
          else if (currentImp < minImpression) reason = `⚠️동결(데이터부족)`;
          else {
              if (currentRank === targetRank) reason = '✅목표달성';
              else if (currentRank < targetRank) {
                   newBid = Math.max(kw.bidAmt - bidStep, 70);
                   reason = `🔻순위관리(${currentRank}위)`;
              }
              else if (currentRank > targetRank) {
                   newBid += bidStep;
                   reason = `🔺순위관리(${currentRank}위)`;
              }
          }
      }
      if (newBid > rankedMaxBid) { newBid = rankedMaxBid; reason += '(한도)'; }
      if (newBid < 70) newBid = 70;
      newBid = Math.round(newBid / 10) * 10;
      return { newBid, reason };
  };

  const startCampaignCycle = () => {
    if (selectedGroupIds.length === 0) return alert("입찰할 그룹을 선택하세요.");
    
    const activeCampaigns = campaigns.filter(c => {
        const loadedGroups = loadedGroupsMap[c.nccCampaignId] || [];
        return loadedGroups.some(g => selectedGroupIds.includes(g.nccAdGroupId));
    });

    setNextRunTime(null);
    setCurrentCampaignIndex(0);
    setIsRunning(true);
    isRunningRef.current = true;
    
    processCampaignStep(0, activeCampaigns);
  };

  const processCampaignStep = async (index: number, targetList: Campaign[]) => {
      if (index >= targetList.length) {
        if (isLooping && isRunningRef.current) {
            const ms = loopInterval * 60 * 1000;
            setNextRunTime(new Date(Date.now() + ms));
            setStatusMessage(`✅ 사이클 완료. ${loopInterval}분 뒤 재시작.`);
            loopTimerRef.current = setTimeout(() => startCampaignCycle(), ms);
        } else {
            setIsRunning(false);
            setStatusMessage("✅ 1회 실행 완료.");
        }
        return;
      }

      setCurrentCampaignIndex(index);
      const selectedCampaign = targetList[index];

      if (!selectedCampaign || (selectedCampaign.status !== 'ELIGIBLE' && selectedCampaign.status !== 'ON')) {
          setStatusMessage(`🚫 [${selectedCampaign?.name}] 캠페인 OFF -> Skip`);
          setTimeout(() => processCampaignStep(index + 1, targetList), 200);
          return;
      }

      const campName = selectedCampaign.name;
      const deviceLabel = targetDevice === 'MOBILE' ? '모바일' : 'PC';
      setStatusMessage(`[캠페인 모드] '${campName}' 로딩 중...`);
      setProcessingGroups([]);

      try {
          let groups = loadedGroupsMap[selectedCampaign.nccCampaignId];
          if (!groups) {
              groups = await naverService.getAdGroups(selectedCampaign.nccCampaignId);
              setLoadedGroupsMap(prev => ({ ...prev, [selectedCampaign.nccCampaignId]: groups }));
          }
          
          setProcessingGroups(groups.map((g: any) => g.name));

          for (const group of groups) {
              if (!selectedGroupIds.includes(group.nccAdGroupId)) continue;
              if (group.status !== 'ELIGIBLE' && group.status !== 'ON') continue;
              if (!isRunningRef.current) break;

              setStatusMessage(`▶ '${campName}' > [${group.name}] 입찰 중 (${deviceLabel})...`);
              
              const kwds = await naverService.getKeywords(group.nccAdGroupId, targetDevice);
              const groupUpdates: any[] = [];
              const serverLogs: LogItem[] = [];

              kwds.filter((k: Keyword) => k.status === 'ELIGIBLE' || k.status === 'ON').forEach((kw: Keyword) => {
                  const { newBid, reason } = calculateBidLogic(kw);
                  if (newBid !== kw.bidAmt || reason.includes('확인필요') || reason.includes('고액')) {
                      if (newBid !== kw.bidAmt) {
                          groupUpdates.push({ keywordId: kw.nccKeywordId, adGroupId: kw.nccAdGroupId, bidAmt: newBid });
                      }
                      serverLogs.push({
                          time: new Date().toLocaleTimeString(),
                          keyword: kw.keyword,
                          oldBid: kw.bidAmt,
                          newBid: newBid,
                          reason: `[${group.name}] ${reason}`
                      });
                  }
              });

              if (groupUpdates.length > 0) {
                  const CHUNK = 50;
                  for (let i = 0; i < groupUpdates.length; i += CHUNK) {
                      await naverService.bulkUpdateBids(groupUpdates.slice(i, i + CHUNK));
                  }
              }
              if (serverLogs.length > 0) {
                  await naverService.saveBidLogs(serverLogs);
                  setLogs(prev => [...serverLogs.map(l => ({
                      keywordId: '', keyword: l.keyword, oldBid: l.oldBid, newBid: l.newBid, reason: l.reason
                  })), ...prev].slice(0, 50)); 
              }
              await new Promise(resolve => setTimeout(resolve, 2000)); 
          }
      } catch (e) { console.error(e); }
      
      if (isRunningRef.current) {
        setTimeout(() => processCampaignStep(index + 1, targetList), 500);
      }
  };

  const startSniperCycle = () => {
    if (sniperKeywords.length === 0) return alert("관리할 키워드를 추가해주세요.");
    setNextRunTime(null);
    setCurrentSniperIndex(0);
    setIsRunning(true);
    isRunningRef.current = true;
    processSniperLoop();
    };

  const processSniperLoop = async () => {
      setStatusMessage(`[저격 모드] 핵심 키워드 ${sniperKeywords.length}개 정밀 타격 중...`);
      const updates: any[] = [];
      const serverLogs: LogItem[] = [];
      
      for (let i = 0; i < sniperKeywords.length; i++) {
          if (!isRunningRef.current) break;
          setCurrentSniperIndex(i); 
          const oldKw = sniperKeywords[i];
          try {
              const freshKwList = await naverService.getKeywords(oldKw.nccAdGroupId, targetDevice);
              const freshKw = freshKwList.find((k: Keyword) => k.nccKeywordId === oldKw.nccKeywordId);
              
              if (freshKw && (freshKw.status === 'ELIGIBLE' || freshKw.status === 'ON')) {
                  const { newBid, reason } = calculateBidLogic(freshKw);
                  if (newBid !== freshKw.bidAmt) {
                      updates.push({ keywordId: freshKw.nccKeywordId, adGroupId: freshKw.nccAdGroupId, bidAmt: newBid });
                  }
                  if (newBid !== freshKw.bidAmt || reason.includes('동결')) {
                      serverLogs.push({
                          time: new Date().toLocaleTimeString(),
                          keyword: freshKw.keyword,
                          oldBid: freshKw.bidAmt,
                          newBid: newBid,
                          reason: `[저격] ${reason}`
                      });
                  }
              }
          } catch(e) { console.error(e); }
      }

      if (updates.length > 0) await naverService.bulkUpdateBids(updates);
      if (serverLogs.length > 0) {
          await naverService.saveBidLogs(serverLogs);
          setLogs(prev => [...serverLogs.map(l => ({
              keywordId: '', keyword: l.keyword, oldBid: l.oldBid, newBid: l.newBid, reason: l.reason
          })), ...prev].slice(0, 50));
      }
      finishCycle();
  };

  const searchKeywordToAdd = async () => {
      if (!keywordSearchQuery) return;
      setIsSearching(true);
      try {
          let found: Keyword[] = [];
          const allCampaigns = await naverService.getCampaigns();
          for (const c of allCampaigns) {
              const groups = await naverService.getAdGroups(c.nccCampaignId);
              for (const g of groups) {
                  const kwds = await naverService.getKeywords(g.nccAdGroupId, targetDevice);
                  const matched = kwds.filter((k: Keyword) => k.keyword.includes(keywordSearchQuery));
                  found = [...found, ...matched];
                  if (found.length > 20) break; 
              }
              if (found.length > 20) break;
          }
          setSearchResults(found);
      } catch(e) { console.error(e); }
      setIsSearching(false);
  };

  const addSniperKeyword = (kw: Keyword) => { setSniperKeywords(prev => [...prev, kw]); setSearchResults([]); setKeywordSearchQuery(''); };
  const removeSniperKeyword = (id: string) => { setSniperKeywords(prev => prev.filter(k => k.nccKeywordId !== id)); };

  const finishCycle = () => {
      if (!isRunningRef.current) return;
      setIsRunning(false);
      setCurrentCampaignIndex(-1);
      setCurrentSniperIndex(-1);
      if (isLooping) {
          const ms = loopInterval * 60 * 1000;
          setNextRunTime(new Date(Date.now() + ms));
          setStatusMessage(`✅ 사이클 완료. ${loopInterval}분 뒤 재시작.`);
          loopTimerRef.current = setTimeout(() => {
              if (mode === 'CAMPAIGN') startCampaignCycle();
              else startSniperCycle();
          }, ms);
      } else {
          setStatusMessage("✅ 1회 실행 완료.");
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Zap className="w-7 h-7 mr-2 text-yellow-500"/> 스마트 입찰 매니저
          </h2>
          <p className="text-gray-500 text-sm mt-1 ml-9">손실 회피형 스마트 알고리즘 (OFF 캠페인 자동 보호)</p>
        </div>
        
        <div className="bg-gray-100 p-1 rounded-lg flex text-sm font-bold">
            <button onClick={() => !isRunning && setMode('CAMPAIGN')} className={`px-4 py-2 rounded-md ${mode === 'CAMPAIGN' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                <List className="w-4 h-4 mr-2 inline"/> 선택 입찰
            </button>
            <button onClick={() => !isRunning && setMode('SNIPER')} className={`px-4 py-2 rounded-md ${mode === 'SNIPER' ? 'bg-white shadow text-red-500' : 'text-gray-500'}`}>
                <Target className="w-4 h-4 mr-2 inline"/> 저격 입찰
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측 리스트 */}
        <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[600px]">
            {mode === 'CAMPAIGN' ? (
                <>
                    <div className="flex justify-between items-center mb-4 pb-2 border-b">
                        <h3 className="font-bold text-gray-700 flex items-center"><List className="w-4 h-4 mr-2"/> 캠페인 선택 ({selectedGroupIds.length}개 그룹)</h3>
                        <span className="text-xs text-blue-600 cursor-pointer" onClick={() => setSelectedGroupIds([])}>전체해제</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                        {campaigns.map((c, idx) => (
                            <CampaignItem 
                                key={c.nccCampaignId}
                                c={c}
                                expandedCampaigns={expandedCampaigns}
                                selectedGroupIds={selectedGroupIds}
                                loadedGroupsMap={loadedGroupsMap}
                                toggleExpand={toggleExpand}
                                toggleCampaignSelection={toggleCampaignSelection}
                                toggleGroupSelection={toggleGroupSelection}
                                isRunning={isRunning}
                                isCurrentRunning={isRunning && currentCampaignIndex === idx}
                            />
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex justify-between items-center mb-4 pb-2 border-b">
                        <h3 className="font-bold text-red-600 flex items-center"><Target className="w-4 h-4 mr-2"/> 저격 키워드 ({sniperKeywords.length})</h3>
                    </div>
                     <div className="mb-4 relative">
                        <div className="flex gap-2">
                            <input type="text" placeholder="키워드 검색 후 추가" className="flex-1 border text-sm p-2 rounded" value={keywordSearchQuery} onChange={e => setKeywordSearchQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && searchKeywordToAdd()}/>
                            <button onClick={searchKeywordToAdd} className="bg-gray-800 text-white p-2 rounded"><Search className="w-4 h-4"/></button>
                        </div>
                        {isSearching && <div className="text-xs text-gray-500 mt-1">검색 중...</div>}
                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border shadow-lg z-10 max-h-40 overflow-y-auto mt-1 rounded">
                                {searchResults.map(kw => (
                                    <div key={kw.nccKeywordId} className="p-2 hover:bg-gray-50 flex justify-between items-center cursor-pointer" onClick={() => addSniperKeyword(kw)}>
                                        <span className="text-sm">{kw.keyword}</span>
                                        <Plus className="w-3 h-3 text-blue-600"/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 bg-gray-50 p-2 rounded border">
                        {sniperKeywords.map((kw, idx) => (
                            <div key={kw.nccKeywordId} className={`flex justify-between items-center p-2 bg-white border rounded shadow-sm ${isRunning && currentSniperIndex === idx ? 'ring-2 ring-red-400' : ''}`}>
                                <div><div className="text-sm font-bold">{kw.keyword}</div><div className="text-xs text-gray-400">현재: {kw.bidAmt}원 | {kw.currentRankEstimate}위</div></div>
                                <button onClick={() => removeSniperKeyword(kw.nccKeywordId)}><X className="w-3 h-3 text-gray-300 hover:text-red-500"/></button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>

        {/* 우측 설정 */}
        <div className="lg:col-span-2 flex flex-col gap-4 h-[600px]">
             <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex-shrink-0">
                 <div className="flex justify-between mb-4">
                    <div className="font-bold flex items-center text-gray-700"><Settings2 className="w-4 h-4 mr-2"/> 입찰 전략 설정</div>
                    <div className="flex bg-gray-100 rounded p-1 text-xs">
                        <button onClick={() => !isLooping && setTargetDevice('PC')} className={`px-2 py-1 rounded ${targetDevice==='PC'?'bg-white shadow font-bold':'text-gray-500 hover:bg-gray-200'}`}>PC</button>
                        <button onClick={() => !isLooping && setTargetDevice('MOBILE')} className={`px-2 py-1 rounded ${targetDevice==='MOBILE'?'bg-white shadow font-bold':'text-gray-500 hover:bg-gray-200'}`}>Mobile</button>
                    </div>
                </div>
                 <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                    <div><label className="block text-gray-500 text-xs mb-1">목표 순위</label><input type="number" className="border rounded w-full p-1.5" value={targetRank} onChange={e=>setTargetRank(Number(e.target.value))} disabled={isLooping}/></div>
                    <div><label className="block text-gray-500 text-xs mb-1">입찰 단위</label><input type="number" className="border rounded w-full p-1.5" value={bidStep} onChange={e=>setBidStep(Number(e.target.value))} disabled={isLooping}/></div>
                    <div><label className="block text-gray-500 text-xs mb-1">순위권 한도</label><input type="number" className="border rounded w-full p-1.5" value={rankedMaxBid} onChange={e=>setRankedMaxBid(Number(e.target.value))} disabled={isLooping}/></div>
                    <div><label className="block text-gray-500 text-xs mb-1">탐색 한도</label><input type="number" className="border rounded w-full p-1.5" value={probeMaxBid} onChange={e=>setProbeMaxBid(Number(e.target.value))} disabled={isLooping}/></div>
                    <div><label className="block text-gray-500 text-xs mb-1">반복 간격(분)</label><input type="number" className="border rounded w-full p-1.5" value={loopInterval} onChange={e=>setLoopInterval(Number(e.target.value))} disabled={isLooping}/></div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-1">
                        {/* [수정] block과 flex 충돌 해결: block 제거 */}
                        <div className="flex justify-between items-center mb-1"><label className="text-yellow-700 text-xs font-bold flex items-center"><Eye className="w-3 h-3 mr-1"/>신뢰 노출수</label></div>
                        <input type="number" className="border border-yellow-300 rounded w-full p-1.5 bg-white text-yellow-800 font-bold" value={minImpression} onChange={e=>setMinImpression(Number(e.target.value))} disabled={isLooping}/>
                    </div>
                </div>
                 <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center"><input type="checkbox" id="loop" className="w-4 h-4 accent-naver-green mr-2" checked={isLooping} onChange={e=>!isRunning && setIsLooping(e.target.checked)} disabled={isRunning}/><label htmlFor="loop" className="text-sm font-bold cursor-pointer">무한 반복 실행</label></div>
                    {/* [수정] 실행 중이면 무조건 중단 버튼 나오도록 수정 */}
                    {isRunning ? (
                        <button onClick={stopAutoBid} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold shadow flex items-center animate-pulse"><StopCircle className="w-4 h-4 mr-2"/> 입찰 중단</button>
                    ) : (
                        <button onClick={mode === 'CAMPAIGN' ? startCampaignCycle : startSniperCycle} className="bg-naver-green hover:bg-naver-dark text-white px-6 py-2 rounded-lg font-bold shadow flex items-center">
                            <Play className="w-4 h-4 mr-2"/> {mode === 'CAMPAIGN' ? '선택 입찰 시작' : '저격 입찰 시작'}
                        </button>
                    )}
                </div>
             </div>

             <div className="flex-1 bg-gray-900 text-white rounded-xl shadow-lg flex flex-col overflow-hidden">
                <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                    <div className="flex items-center text-sm font-bold">
                        {isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-green-400"/> : <Clock className="w-4 h-4 mr-2 text-gray-400"/>}
                        {statusMessage}
                    </div>
                    <div className="text-xs text-orange-300">{nextRunTime && `다음 실행: ${nextRunTime.toLocaleTimeString()}`}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                    {logs.map((log, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-gray-700 pb-1 mb-1">
                            <div><span className="text-green-400 font-bold">[{log.keyword}]</span> <span className="text-gray-300">{log.oldBid} → <span className="text-white font-bold">{log.newBid}</span></span></div>
                            <div className="text-gray-400 text-[10px]">{log.reason}</div>
                        </div>
                    ))}
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};