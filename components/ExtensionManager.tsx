// components/ExtensionManager.tsx 전체 덮어쓰기

import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Extension, Campaign, AdGroup, BusinessChannel } from '../types';
import { 
  Phone, MapPin, Link as LinkIcon, Image as ImageIcon, 
  Grid, Loader2, RefreshCw, AlertCircle, PhoneCall, Globe, Calculator, 
  ChevronDown, ChevronUp, Layers, ExternalLink, Copy, CheckSquare
} from 'lucide-react';

interface GroupedExtension {
  id: string; // 그룹화 키
  type: string;
  content: any; 
  businessChannelId?: string;
  channelName?: string;
  channelUrl?: string;
  items: Extension[]; 
  ownerIds: string[]; // 사용 중인 그룹 ID들
  groupNames: string[]; // 사용 중인 그룹 이름들
}

export const ExtensionManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [channels, setChannels] = useState<BusinessChannel[]>([]);
  
  const [groupedExtensions, setGroupedExtensions] = useState<GroupedExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [dynamicTabs, setDynamicTabs] = useState<{id: string, label: string, icon: any}[]>([]);
  
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const [selectedTargets, setSelectedTargets] = useState<Record<string, Set<string>>>({});
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    loadCampaigns();
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadData(selectedCampaignId);
    } else {
      setGroupedExtensions([]);
      setAdGroups([]);
      setDynamicTabs([]);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    try {
      const data = await naverService.getCampaigns();
      setCampaigns(data);
    } catch (error) { console.error(error); }
  };

  const loadChannels = async () => {
    try {
      const data = await naverService.getChannels();
      setChannels(data);
    } catch (error) { console.error(error); }
  };

  const loadData = async (campaignId: string) => {
    setLoading(true);
    try {
      const groups = await naverService.getAdGroups(campaignId);
      setAdGroups(groups);
      const groupMap: Record<string, string> = {};
      groups.forEach(g => groupMap[g.nccAdGroupId] = g.name);

      const channelMap: Record<string, BusinessChannel> = {};
      channels.forEach(ch => channelMap[ch.nccBusinessChannelId] = ch);

      const exts = await naverService.getExtensions(campaignId);
      const grouped = groupExtensions(exts, groupMap, channelMap);
      setGroupedExtensions(grouped);

      const types = new Set(grouped.map(g => g.type));
      const newTabs = [{ id: 'ALL', label: '전체', icon: Grid }];
      if (types.has('PHONE')) newTabs.push({ id: 'PHONE', label: '전화번호', icon: Phone });
      if (types.has('LOCATION') || types.has('PLACE')) newTabs.push({ id: 'LOCATION', label: '위치', icon: MapPin });
      if (types.has('SUB_LINKS')) newTabs.push({ id: 'SUB_LINKS', label: '서브링크', icon: LinkIcon });
      if (types.has('WEBSITE_INFO')) newTabs.push({ id: 'WEBSITE_INFO', label: '웹사이트', icon: Globe });
      if (types.has('POWER_LINK_IMAGE') || types.has('IMAGE_SUB_LINKS')) newTabs.push({ id: 'IMAGES', label: '이미지', icon: ImageIcon });
      
      setDynamicTabs(newTabs);
      if (!types.has(activeTab) && activeTab !== 'ALL' && activeTab !== 'IMAGES') setActiveTab('ALL');

    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupExtensions = (extensions: Extension[], groupMap: Record<string, string>, channelMap: Record<string, BusinessChannel>) => {
    const groups: Record<string, GroupedExtension> = {};

    extensions.forEach(ext => {
      const contentKey = JSON.stringify(ext.extension || {});
      const channelId = ext.pcChannelId || ext.mobileChannelId || '';
      const channelInfo = channelId ? channelMap[channelId] : undefined;
      const uniqueKey = `${ext.type}|${contentKey}|${channelId}`;

      if (!groups[uniqueKey]) {
        groups[uniqueKey] = {
          id: uniqueKey,
          type: ext.type,
          content: ext.extension,
          businessChannelId: channelId,
          channelName: channelInfo?.name,
          channelUrl: (channelInfo as any)?.channelKey, 
          items: [],
          ownerIds: [],
          groupNames: []
        };
      }

      groups[uniqueKey].items.push(ext);
      groups[uniqueKey].ownerIds.push(ext.ownerId);
      const groupName = groupMap[ext.ownerId] || ext.ownerId || '알 수 없는 그룹';
      groups[uniqueKey].groupNames.push(groupName);
    });

    return Object.values(groups);
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItems(newSet);
  };

  const toggleTarget = (extGroupId: string, targetGroupId: string) => {
    const currentSet = new Set(selectedTargets[extGroupId] || []);
    if (currentSet.has(targetGroupId)) currentSet.delete(targetGroupId);
    else currentSet.add(targetGroupId);
    
    setSelectedTargets({ ...selectedTargets, [extGroupId]: currentSet });
  };

  const toggleAllTargets = (extGroupId: string, allTargetIds: string[]) => {
    const currentSet = new Set(selectedTargets[extGroupId] || []);
    if (currentSet.size === allTargetIds.length) {
        setSelectedTargets({ ...selectedTargets, [extGroupId]: new Set() });
    } else {
        setSelectedTargets({ ...selectedTargets, [extGroupId]: new Set(allTargetIds) });
    }
  };

  const handleCopyExtensions = async (group: GroupedExtension) => {
    const targets = selectedTargets[group.id];
    if (!targets || targets.size === 0) {
        alert("복사할 대상 그룹을 선택해주세요.");
        return;
    }

    if (!confirm(`선택한 ${targets.size}개 그룹에 이 확장소재를 복사하시겠습니까?`)) return;

    setIsCopying(true);
    let successCount = 0;
    
    try {
        for (const targetGroupId of Array.from(targets)) {
            try {
                await naverService.createExtension(
                    targetGroupId, 
                    group.type, 
                    group.businessChannelId, 
                    group.content
                );
                successCount++;
            } catch (e) {
                console.error(`그룹(${targetGroupId}) 복사 실패:`, e);
            }
        }
        alert(`${successCount}개 그룹에 복사 완료!`);
        
        setSelectedTargets({ ...selectedTargets, [group.id]: new Set() });
        loadData(selectedCampaignId);

    } catch (e) {
        alert("작업 중 오류가 발생했습니다.");
    } finally {
        setIsCopying(false);
    }
  };

  const filteredList = activeTab === 'ALL' 
    ? groupedExtensions 
    : groupedExtensions.filter(g => g.type === activeTab || (activeTab === 'IMAGES' && (g.type === 'POWER_LINK_IMAGE' || g.type === 'IMAGE_SUB_LINKS')));

  const renderContent = (group: GroupedExtension) => {
    const { type, content, businessChannelId, channelName, channelUrl } = group;
    
    if (businessChannelId) {
        return (
            <div className="text-sm">
                <div className="flex items-center gap-2 mb-1">
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded font-bold">비즈채널</span>
                    <span className="font-bold text-gray-800">{channelName || businessChannelId}</span>
                </div>
                {type === 'PLACE' && <div className="text-xs text-gray-500"><MapPin className="w-3 h-3 inline mr-1"/>플레이스 정보 연동</div>}
                {type === 'WEBSITE_INFO' && (
                    <div className="text-xs text-gray-500 mt-1">
                        <div className="flex items-center"><Globe className="w-3 h-3 inline mr-1"/>{channelUrl || 'URL 정보 없음'}</div>
                        {content.agree !== undefined && <span className={content.agree ? 'text-green-600 ml-1' : 'text-red-500 ml-1'}>(동의: {content.agree ? 'Y' : 'N'})</span>}
                    </div>
                )}
            </div>
        );
    }

    switch (type) {
      case 'PHONE':
        return (
          <div className="flex items-center text-lg font-bold text-gray-800">
            <PhoneCall className="w-5 h-5 mr-2 text-green-600"/>
            {content.phoneNumber || '번호 없음'}
          </div>
        );
      case 'SUB_LINKS':
        return (
          <div className="text-sm">
             <div className="font-bold mb-1 text-gray-700">서브링크 ({content.links?.length || 0}개)</div>
             <div className="space-y-1">
               {content.links?.map((l: any, i: number) => (
                 <div key={i} className="flex justify-between text-xs bg-gray-50 p-1 rounded">
                   <span className="font-medium">{l.linkName}</span>
                   <span className="text-gray-400 truncate max-w-[150px]">{l.pcUrl}</span>
                 </div>
               ))}
             </div>
          </div>
        );
      case 'POWER_LINK_IMAGE':
        return (
            <div className="flex items-center gap-3">
                {content.imagePath ? (
                    <img src={`https://ssl.pstatic.net/tveta/libs${content.imagePath}`} alt="파워링크" className="w-20 h-20 object-cover rounded border"/>
                ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center text-gray-400 text-xs">No Image</div>
                )}
                <div className="text-xs text-gray-500">
                    <div>파워링크 이미지</div>
                    <div className="truncate w-32">{content.imagePath}</div>
                </div>
            </div>
        );
      case 'IMAGE_SUB_LINKS':
        return (
            <div>
                <div className="font-bold text-sm mb-2 text-gray-700">이미지 서브링크 ({content.images?.length || 0}개)</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {content.images?.map((img: any, i: number) => (
                        <div key={i} className="flex-shrink-0 w-16 text-center">
                            <img src={`https://ssl.pstatic.net/tveta/libs${img.imageUrl}`} className="w-16 h-16 object-cover rounded border mb-1"/>
                            <div className="text-[10px] truncate">{img.linkText}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
      default:
        return (
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded break-all">
            {JSON.stringify(content).slice(0, 100)}...
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
             <Layers className="w-7 h-7 mr-2 text-indigo-600"/> 확장소재 배포 관리
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedCampaignId} 
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="flex-1 max-w-md border-2 border-indigo-100 rounded-lg p-2.5 font-medium text-gray-700 focus:border-indigo-500 outline-none"
          >
            <option value="">대상 캠페인을 선택하세요</option>
            {campaigns.map(c => (
              <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>
            ))}
          </select>
          
          {selectedCampaignId && (
             <button onClick={() => loadData(selectedCampaignId)} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="새로고침">
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}/>
             </button>
          )}
        </div>
      </div>

      {selectedCampaignId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="flex border-b overflow-x-auto scrollbar-hide bg-gray-50">
            {dynamicTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-5 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2
                  ${activeTab === tab.id 
                    ? 'border-indigo-600 text-indigo-600 bg-white' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <tab.icon className="w-4 h-4 mr-2"/>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto bg-gray-50">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin mb-3 text-indigo-400"/>
                <p>데이터를 분석 중입니다...</p>
              </div>
            ) : filteredList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredList.map((group) => {
                  const isExpanded = expandedItems.has(group.id);
                  const sampleStatus = group.items[0]?.inspectStatus;
                  
                  const usedGroupIds = new Set(group.ownerIds);
                  const unusedGroups = adGroups.filter(g => !usedGroupIds.has(g.nccAdGroupId));
                  const selectedSet = selectedTargets[group.id] || new Set();

                  return (
                    <div key={group.id} className={`bg-white p-4 rounded-xl border transition-all flex flex-col ${isExpanded ? 'border-indigo-300 shadow-md ring-1 ring-indigo-100' : 'border-gray-200 hover:shadow-lg'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-2">
                          <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wide">
                            {group.type}
                          </span>
                          {sampleStatus && (
                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${sampleStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {sampleStatus}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${unusedGroups.length > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          {unusedGroups.length > 0 ? `${unusedGroups.length}개 그룹 미사용` : '모든 그룹 사용중'}
                        </span>
                      </div>

                      <div className="flex-1 mb-4">
                        {renderContent(group)}
                      </div>

                      <div className="border-t pt-2 mt-auto">
                        <button 
                          onClick={() => toggleExpand(group.id)}
                          className="w-full flex justify-between items-center text-xs font-bold text-gray-500 hover:bg-gray-50 p-2 rounded transition-colors"
                        >
                          <span>{isExpanded ? '접기' : '배포 관리 / 그룹 보기'}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-3 space-y-4 animate-fadeIn">
                            {unusedGroups.length > 0 && (
                                <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs font-bold text-red-700 flex items-center">
                                            <AlertCircle className="w-3 h-3 mr-1"/> 미사용 그룹 ({unusedGroups.length})
                                        </div>
                                        <button 
                                            onClick={() => toggleAllTargets(group.id, unusedGroups.map(g => g.nccAdGroupId))}
                                            className="text-[10px] text-red-500 underline"
                                        >
                                            {selectedSet.size === unusedGroups.length ? '전체 해제' : '전체 선택'}
                                        </button>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
                                        {unusedGroups.map(g => (
                                            <label key={g.nccAdGroupId} className="flex items-center p-1.5 bg-white rounded border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedSet.has(g.nccAdGroupId)}
                                                    onChange={() => toggleTarget(group.id, g.nccAdGroupId)}
                                                    className="rounded border-gray-300 text-red-600 focus:ring-red-500 mr-2"
                                                />
                                                <span className="text-xs text-gray-700 truncate">{g.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => handleCopyExtensions(group)}
                                        disabled={selectedSet.size === 0 || isCopying}
                                        className="w-full mt-2 bg-red-600 text-white text-xs py-2 rounded font-bold hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex justify-center items-center gap-1"
                                    >
                                        {isCopying ? <Loader2 className="w-3 h-3 animate-spin"/> : <Copy className="w-3 h-3"/>}
                                        선택한 {selectedSet.size}개 그룹에 복사
                                    </button>
                                </div>
                            )}

                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <div className="text-xs font-bold text-gray-500 mb-2 flex items-center">
                                    <CheckSquare className="w-3 h-3 mr-1"/> 사용 중인 그룹 ({group.groupNames.length})
                                </div>
                                <div className="max-h-20 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
                                    {group.groupNames.map((name, idx) => (
                                        <div key={idx} className="text-xs text-gray-500 py-1 px-2 bg-white rounded border border-gray-100 truncate">
                                            {name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 border-2 border-dashed border-gray-300 rounded-xl bg-white/50">
                <AlertCircle className="w-12 h-12 mb-3 opacity-30"/>
                {/* [수정] tabs -> dynamicTabs로 변경 */}
                <p className="font-medium">등록된 '{dynamicTabs.find(t=>t.id===activeTab)?.label}' 확장소재가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full bg-white rounded-xl border border-gray-200 text-gray-400 shadow-sm flex-1">
          <Layers className="w-16 h-16 mb-4 text-indigo-100"/>
          <p className="text-lg font-bold text-gray-600">관리할 캠페인을 선택해주세요.</p>
        </div>
      )}
    </div>
  );
};