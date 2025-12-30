import React, { useState, useEffect, useRef } from 'react';
import { BidAdjustmentResult, Campaign, Keyword, AdGroup } from '../types';
import { Play, Settings2, Loader2, StopCircle, Clock, Target, List, Zap, Plus, X, Search, CheckSquare, Square, Eye, Download, FileText } from 'lucide-react';
import { naverService, LogItem } from '../services/naverService';

interface AutoBidderProps {
  campaigns: Campaign[];
  keywords: Keyword[];
  adGroups: AdGroup[];
  onRefresh: () => void;
}

type BidMode = 'CAMPAIGN' | 'SNIPER';

export const AutoBidder: React.FC<AutoBidderProps> = ({ campaigns }) => {
  const [mode, setMode] = useState<BidMode>('CAMPAIGN');

  // --- [설정 값] ---
  const [targetRank, setTargetRank] = useState<number>(3); // 목표 순위 (기본 3위)
  const [rankedMaxBid, setRankedMaxBid] = useState<number>(30000); 
  const [probeMaxBid, setProbeMaxBid] = useState<number>(7000);   
  const [bidStep, setBidStep] = useState<number>(1000);
  const [minImpression, setMinImpression] = useState<number>(30); // 신뢰 노출수
  const [loopInterval, setLoopInterval] = useState<number>(10); 
  const [targetDevice, setTargetDevice] = useState<string>('MOBILE'); 

  // --- [실행 상태] ---
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [logs, setLogs] = useState<BidAdjustmentResult[]>([]); // 화면용 로그
  const [statusMessage, setStatusMessage] = useState<string>('대기 중...');
  const [nextRunTime, setNextRunTime] = useState<Date | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [currentCampaignIndex, setCurrentCampaignIndex] = useState<number>(-1);
  const [processingGroups, setProcessingGroups] = useState<string[]>([]); 

  const [sniperKeywords, setSniperKeywords] = useState<Keyword[]>([]); 
  const [keywordSearchQuery, setKeywordSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Keyword[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentSniperIndex, setCurrentSniperIndex] = useState<number>(-1);

  useEffect(() => {
    if (isLooping && !isRunning && !nextRunTime) {
       if (mode === 'CAMPAIGN' && currentCampaignIndex === -1 && selectedCampaignIds.length > 0) {
           startCampaignCycle();
       } else if (mode === 'SNIPER' && currentSniperIndex === -1 && sniperKeywords.length > 0) {
           startSniperCycle();
       }
    }
  }, [isLooping, isRunning, nextRunTime, currentCampaignIndex, currentSniperIndex, mode, selectedCampaignIds, sniperKeywords]);

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

  // --- [최종 합의된 입찰 알고리즘] ---
  const calculateBidLogic = (kw: Keyword) => {
      let newBid = kw.bidAmt;
      let reason = '';
      
      const estimates = kw.bidEstimates || [];
      // [수정] server.py가 targetRank에 맞는 예상가만 보내주므로, rank 일치하는 것을 찾으면 됨
      const targetEstimate = estimates.find(e => e.rank === targetRank);
      
      const currentRank = kw.currentRankEstimate;
      const currentImp = kw.stats.impressions || 0;

      // [0순위] OFF 상태 체크는 루프 상단에서 처리됨

      // [1순위] 네이버 예상가 적용 (허수 70원 제외)
      let estimateApplied = false;
      if (targetEstimate && targetEstimate.bid > 70) {
          newBid = targetEstimate.bid;
          const diff = newBid - kw.bidAmt;
          reason = `🎯예상가적용(${targetRank}위) ${diff>0?'▲':'▼'}${Math.abs(diff)}`;
          estimateApplied = true;
      }

      if (!estimateApplied) {
          // [2순위] 순위 0위 (미노출) 대응
          if (currentRank === 0) {
              // Case E (저가 미노출): 탐색 한도 내라면 증액
              if (kw.bidAmt < probeMaxBid) {
                  newBid += bidStep;
                  reason = '🔍탐색(순위없음/증액)';
              } 
              // Case F (고가 미노출): 탐색 한도 넘었으면 동결
              else {
                  reason = '⚠️동결(순위없음/고액보호)';
              }
          } 
          // [3순위] 데이터 신뢰도 체크
          else if (currentImp < minImpression) {
               reason = `⚠️동결(데이터부족:노출${currentImp})`;
          }
          // [4순위] 순위 기반 정밀 조정
          else {
              if (currentRank === targetRank) {
                   reason = '✅목표달성(동결)';
              }
              else if (currentRank < targetRank) { // 1위 < 3위 (너무 높음 -> 깎자)
                   newBid = Math.max(kw.bidAmt - bidStep, 70);
                   reason = `🔻순위관리(과비용:${currentRank}위)`;
              }
              else if (currentRank > targetRank) { // 4위 > 3위 (너무 낮음 -> 올리자)
                   newBid += bidStep;
                   reason = `🔺순위관리(${currentRank}위)`;
              }
          }
      }

      // [글로벌 안전장치]
      if (newBid > rankedMaxBid) {
          newBid = rankedMaxBid;
          reason += '(한도제한)';
      }
      
      if (newBid < 70) newBid = 70;
      newBid = Math.round(newBid / 10) * 10;

      return { newBid, reason };
  };

  const toggleCampaign = (id: string) => {
    if (isLooping || isRunning) return;
    setSelectedCampaignIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const startCampaignCycle = () => {
      if (selectedCampaignIds.length === 0) return alert("캠페인을 선택하세요.");
      setNextRunTime(null);
      setCurrentCampaignIndex(0);
      setIsRunning(true);
      processCampaignStep(0);
  };

  const processCampaignStep = async (index: number) => {
      if (index >= selectedCampaignIds.length) {
          finishCycle();
          return;
      }
      setCurrentCampaignIndex(index);
      const campaignId = selectedCampaignIds[index];
      const selectedCampaign = campaigns.find(c => c.nccCampaignId === campaignId);

      if (!selectedCampaign || (selectedCampaign.status !== 'ELIGIBLE' && selectedCampaign.status !== 'ON')) {
          setStatusMessage(`🚫 [${selectedCampaign?.name}] 캠페인 OFF -> Skip`);
          setTimeout(() => processCampaignStep(index + 1), 200);
          return;
      }

      const campName = selectedCampaign.name;
      const deviceLabel = targetDevice === 'MOBILE' ? '모바일' : (targetDevice === 'PC' ? 'PC' : '전체');
      setStatusMessage(`[캠페인 모드] '${campName}' 로딩 중...`);
      setProcessingGroups([]);

      try {
          const groups = await naverService.getAdGroups(campaignId);
          setProcessingGroups(groups.map(g => g.name));

          for (const group of groups) {
              if (group.status !== 'ELIGIBLE' && group.status !== 'ON') continue;

              setStatusMessage(`▶ '${campName}' > [${group.name}] 분석 및 입찰 중 (${deviceLabel})...`);
              
              // [★수정] targetRank 값을 함께 전달!
              const kwds = await naverService.getKeywords(group.nccAdGroupId, targetDevice, targetRank);
              const groupUpdates: any[] = [];
              const serverLogs: LogItem[] = [];

              kwds.filter(k => k.status === 'ELIGIBLE' || k.status === 'ON').forEach(kw => {
                  const { newBid, reason } = calculateBidLogic(kw);
                  
                  if (newBid !== kw.bidAmt || reason.includes('확인필요') || reason.includes('고액보호')) {
                      if (newBid !== kw.bidAmt) {
                          groupUpdates.push({ 
                              keywordId: kw.nccKeywordId, 
                              adGroupId: kw.nccAdGroupId, 
                              bidAmt: newBid 
                          });
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
                      const batch = groupUpdates.slice(i, i + CHUNK);
                      await naverService.bulkUpdateBids(batch);
                  }
              }

              if (serverLogs.length > 0) {
                  await naverService.saveBidLogs(serverLogs);
                  setLogs(prev => [...serverLogs.map(l => ({
                      keywordId: '', keyword: l.keyword, oldBid: l.oldBid, newBid: l.newBid, reason: l.reason
                  })), ...prev].slice(0, 50)); 
              }

              await new Promise(resolve => setTimeout(resolve, 100));
          }
      } catch (e) { console.error(e); }
      setTimeout(() => processCampaignStep(index + 1), 500);
  };

  const startSniperCycle = () => {
      if (sniperKeywords.length === 0) return alert("관리할 키워드를 추가해주세요.");
      setNextRunTime(null);
      setCurrentSniperIndex(0);
      setIsRunning(true);
      processSniperLoop();
  };

  const processSniperLoop = async () => {
      setStatusMessage(`[저격 모드] 핵심 키워드 ${sniperKeywords.length}개 정밀 타격 중...`);
      const updates: any[] = [];
      const serverLogs: LogItem[] = [];
      
      for (let i = 0; i < sniperKeywords.length; i++) {
          setCurrentSniperIndex(i); 
          const oldKw = sniperKeywords[i];
          try {
              // [★수정] 저격 모드에서도 targetRank 전달
              const freshKwList = await naverService.getKeywords(oldKw.nccAdGroupId, targetDevice, targetRank);
              const freshKw = freshKwList.find(k => k.nccKeywordId === oldKw.nccKeywordId);
              
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

      if (updates.length > 0) {
          await naverService.bulkUpdateBids(updates);
      }
      
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
          alert("키워드 검색 중... (잠시만 기다려주세요)");
          let found: Keyword[] = [];
          for (const c of campaigns) {
              const groups = await naverService.getAdGroups(c.nccCampaignId);
              for (const g of groups) {
                  // [★수정] 검색 시에도 targetRank 전달 (일관성 유지)
                  const kwds = await naverService.getKeywords(g.nccAdGroupId, targetDevice, targetRank);
                  const matched = kwds.filter(k => k.keyword.includes(keywordSearchQuery));
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
            <Zap className="w-7 h-7 mr-2 text-yellow-500"/>
            스마트 입찰 매니저
          </h2>
          <p className="text-gray-500 text-sm mt-1 ml-9">
            손실 회피형 스마트 알고리즘 (OFF 캠페인 자동 보호 / 로그 자동 저장)
          </p>
        </div>
        
        <div className="bg-gray-100 p-1 rounded-lg flex text-sm font-bold">
            <button onClick={() => !isRunning && setMode('CAMPAIGN')} className={`px-4 py-2 rounded-md flex items-center transition-all ${mode === 'CAMPAIGN' ? 'bg-white shadow text-naver-green' : 'text-gray-500'}`}>
                <List className="w-4 h-4 mr-2"/> 전체 캠페인 순환 (1단계)
            </button>
            <button onClick={() => !isRunning && setMode('SNIPER')} className={`px-4 py-2 rounded-md flex items-center transition-all ${mode === 'SNIPER' ? 'bg-white shadow text-red-500' : 'text-gray-500'}`}>
                <Target className="w-4 h-4 mr-2"/> 핵심 키워드 저격 (2단계)
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측 리스트 */}
        <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[500px]">
            {mode === 'CAMPAIGN' ? (
                <>
                    <div className="flex justify-between items-center mb-4 pb-2 border-b">
                        <h3 className="font-bold text-gray-700 flex items-center"><List className="w-4 h-4 mr-2"/> 캠페인 목록</h3>
                        <span className="text-xs text-blue-600 cursor-pointer" onClick={() => {if(!isRunning) setSelectedCampaignIds(selectedCampaignIds.length===campaigns.length?[]:campaigns.map(c=>c.nccCampaignId))}}>전체선택</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                        {campaigns.map((c, idx) => (
                            <div key={c.nccCampaignId} className="space-y-1">
                                <div onClick={() => toggleCampaign(c.nccCampaignId)} className={`flex items-center p-2 rounded cursor-pointer border ${selectedCampaignIds.includes(c.nccCampaignId) ? 'border-naver-green bg-green-50' : 'border-transparent hover:bg-gray-50'}`}>
                                    {selectedCampaignIds.includes(c.nccCampaignId) ? <CheckSquare className="w-4 h-4 text-naver-green"/> : <Square className="w-4 h-4 text-gray-300"/>}
                                    <span className="ml-2 text-sm truncate flex-1">{c.name}</span>
                                    {isRunning && currentCampaignIndex === idx && <Loader2 className="w-3 h-3 animate-spin text-blue-600"/>}
                                </div>
                            </div>
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

        {/* 우측: 설정 및 로그 */}
        <div className="lg:col-span-2 flex flex-col gap-4 h-[500px]">
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
                        <div className="flex justify-between items-center mb-1"><label className="block text-yellow-700 text-xs font-bold flex items-center"><Eye className="w-3 h-3 mr-1"/>신뢰 노출수</label></div>
                        <input type="number" className="border border-yellow-300 rounded w-full p-1.5 bg-white text-yellow-800 font-bold" value={minImpression} onChange={e=>setMinImpression(Number(e.target.value))} disabled={isLooping} title="이 값 미만이면 1위라도 동결 (가짜순위 방어)"/>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center"><input type="checkbox" id="loop" className="w-4 h-4 accent-naver-green mr-2" checked={isLooping} onChange={e=>!isRunning && setIsLooping(e.target.checked)} disabled={isRunning}/><label htmlFor="loop" className="text-sm font-bold cursor-pointer">무한 반복 실행</label></div>
                    {isLooping && isRunning ? (
                        <button onClick={stopAutoBid} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold shadow flex items-center"><StopCircle className="w-4 h-4 mr-2 animate-pulse"/> 중단</button>
                    ) : (
                        <button onClick={mode==='CAMPAIGN'?startCampaignCycle:startSniperCycle} className="bg-naver-green hover:bg-naver-dark text-white px-6 py-2 rounded-lg font-bold shadow flex items-center"><Play className="w-4 h-4 mr-2"/> {mode==='CAMPAIGN'?'캠페인 입찰 시작':'저격 입찰 시작'}</button>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-gray-900 text-white rounded-xl shadow-lg flex flex-col overflow-hidden">
                <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                    <div className="flex items-center text-sm font-bold">
                        {isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-green-400"/> : <Clock className="w-4 h-4 mr-2 text-gray-400"/>}
                        {statusMessage}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 flex items-center"><FileText className="w-3 h-3 mr-1"/>모든 로그는 자동 저장됨</span>
                        {nextRunTime && <div className="text-xs text-orange-300">다음 실행: {nextRunTime.toLocaleTimeString()}</div>}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                    {logs.length === 0 && <div className="text-gray-500 text-center mt-10">대기 중... 로그는 'logs' 폴더에 자동 저장됩니다.</div>}
                    {logs.map((log, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-gray-700 pb-1 mb-1 last:border-0 hover:bg-gray-800 p-1 rounded">
                            <div>
                                <span className="text-green-400 font-bold mr-2">[{log.keyword}]</span>
                                <span className="text-gray-300">{log.oldBid.toLocaleString()} → <span className="text-white font-bold">{log.newBid.toLocaleString()}</span></span>
                            </div>
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