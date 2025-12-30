import React, { useState, useEffect } from 'react';
import { Campaign, AdGroup, Ad, Status } from '../types';
import { naverService } from '../services/naverService';
import { Filter, Image as ImageIcon, Plus, Trash2, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  campaigns: Campaign[];
}

export const CreativeManager: React.FC<Props> = ({ campaigns }) => {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<AdGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>('');
  
  // Selection State
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [lastClickedGroupId, setLastClickedGroupId] = useState<string | null>(null);
  
  // Data for Right Panel
  const [currentAds, setCurrentAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  // Template Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tplHeadline, setTplHeadline] = useState('');
  const [tplDescription, setTplDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Load Groups on Campaign Change
  const handleCampaignChange = async (cid: string) => {
    setSelectedCampaign(cid);
    setAdGroups([]);
    setFilteredGroups([]);
    setSelectedGroupIds(new Set());
    setLastClickedGroupId(null);
    setCurrentAds([]);
    
    if (cid) {
      try {
        const groups = await naverService.getAdGroups(cid);
        setAdGroups(groups);
        setFilteredGroups(groups);
      } catch(e) { console.error(e); }
    }
  };

  const handleFilter = () => {
      const f = groupFilter.trim();
      if (!f) {
          setFilteredGroups(adGroups);
          return;
      }
      setFilteredGroups(adGroups.filter(g => g.name.includes(f)));
  };

  const handleGroupClick = async (gid: string) => {
      // Toggle selection logic handled separately via checkbox? No, user said "Left List".
      // Let's make row click = select for viewing ads.
      // Checkbox = select for bulk action.
      setLastClickedGroupId(gid);
      setLoadingAds(true);
      try {
          const ads = await naverService.getAdsByGroup(gid);
          // Fix status bool to enum if needed (though service handles it)
          setCurrentAds(ads);
      } catch (e) { console.error(e); }
      setLoadingAds(false);
  };

  const toggleGroupSelection = (gid: string, checked: boolean) => {
      const newSet = new Set(selectedGroupIds);
      if (checked) newSet.add(gid);
      else newSet.delete(gid);
      setSelectedGroupIds(newSet);
  };

  const handleBulkCreate = async () => {
      if (!tplHeadline || !tplDescription) {
          alert("제목과 설명을 입력해주세요.");
          return;
      }
      if (selectedGroupIds.size === 0) {
          alert("좌측에서 대상 그룹을 하나 이상 체크해주세요.");
          return;
      }

      setIsCreating(true);
      let success = 0;
      
      for (const gid of Array.from(selectedGroupIds)) {
          try {
              await naverService.createAd(gid, tplHeadline, tplDescription);
              success++;
          } catch(e) { console.error(e); }
      }

      setIsCreating(false);
      setShowTemplateModal(false);
      alert(`${success}개 그룹에 소재 등록 완료!`);
      setTplHeadline('');
      setTplDescription('');
      
      // Refresh current view if affected
      if (lastClickedGroupId && selectedGroupIds.has(lastClickedGroupId)) {
          handleGroupClick(lastClickedGroupId);
      }
  };

  const handleDeleteAd = async (adId: string) => {
      if(!confirm("이 소재를 삭제하시겠습니까?")) return;
      await naverService.deleteAd(adId);
      if (lastClickedGroupId) handleGroupClick(lastClickedGroupId);
  };

  const toggleAdStatus = async (ad: Ad) => {
      const next = ad.status === Status.ELIGIBLE ? Status.PAUSED : Status.ELIGIBLE;
      await naverService.updateAdStatus(ad.nccAdId, next);
      if (lastClickedGroupId) handleGroupClick(lastClickedGroupId);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <ImageIcon className="mr-2"/> 소재(Creative) 그룹별 관리
        </h2>

        {/* Campaign Select */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center space-x-4">
            <span className="font-bold text-gray-700">캠페인 선택:</span>
            <select className="flex-1 border p-2 rounded" value={selectedCampaign} onChange={(e) => handleCampaignChange(e.target.value)}>
                <option value="">캠페인을 선택하세요</option>
                {campaigns.map(c => <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>)}
            </select>
        </div>

        <div className="flex-1 flex space-x-6 overflow-hidden">
            {/* Left: Group List */}
            <div className="w-1/3 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-700 mb-2">1. 광고그룹 선택</h3>
                    <div className="flex gap-2">
                        <input className="flex-1 border p-2 rounded text-sm" placeholder="그룹명 검색" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()}/>
                        <button onClick={handleFilter} className="bg-gray-200 p-2 rounded hover:bg-gray-300"><Filter className="w-4 h-4"/></button>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                         <span className="text-xs text-gray-500">{selectedGroupIds.size}개 선택됨</span>
                         <button 
                            onClick={() => setShowTemplateModal(true)}
                            disabled={selectedGroupIds.size === 0}
                            className="bg-naver-green text-white text-xs px-3 py-1.5 rounded font-bold hover:bg-naver-dark disabled:bg-gray-300"
                        >
                             + 템플릿 일괄 등록
                         </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {filteredGroups.length === 0 ? <p className="text-center text-gray-400 mt-10 text-sm">그룹이 없습니다.</p> : (
                        <table className="w-full text-sm">
                            <tbody>
                                {filteredGroups.map(g => (
                                    <tr 
                                        key={g.nccAdGroupId} 
                                        className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer ${lastClickedGroupId === g.nccAdGroupId ? 'bg-blue-50' : ''}`}
                                        onClick={() => handleGroupClick(g.nccAdGroupId)}
                                    >
                                        <td className="p-3 w-8" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedGroupIds.has(g.nccAdGroupId)}
                                                onChange={(e) => toggleGroupSelection(g.nccAdGroupId, e.target.checked)}
                                                className="w-4 h-4"
                                            />
                                        </td>
                                        <td className="p-3 text-gray-700">
                                            <div className="font-medium truncate max-w-[180px]">{g.name}</div>
                                            <div className="text-xs text-gray-400">{g.status === 'ELIGIBLE' ? 'ON' : 'OFF'}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Right: Ad List */}
            <div className="w-2/3 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">2. 소재 리스트 {lastClickedGroupId && <span className="text-naver-green font-normal ml-2">({filteredGroups.find(g => g.nccAdGroupId === lastClickedGroupId)?.name})</span>}</h3>
                    <button onClick={() => lastClickedGroupId && handleGroupClick(lastClickedGroupId)} className="text-gray-500 hover:text-naver-green"><RefreshCw className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {!lastClickedGroupId ? (
                        <div className="h-full flex items-center justify-center text-gray-400">좌측에서 그룹을 클릭하여 소재를 확인하세요.</div>
                    ) : loadingAds ? (
                        <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-naver-green w-8 h-8"/></div>
                    ) : currentAds.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400">등록된 소재가 없습니다.</div>
                    ) : (
                        <div className="space-y-4">
                            {currentAds.map(ad => (
                                <div key={ad.nccAdId} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-lg font-bold text-blue-600 mb-1">{ad.headline}</h4>
                                            <p className="text-gray-600 text-sm">{ad.description}</p>
                                            <div className="mt-2 text-xs text-gray-400">ID: {ad.nccAdId} | Type: {ad.type}</div>
                                        </div>
                                        <div className="flex flex-col space-y-2">
                                            <button 
                                                onClick={() => toggleAdStatus(ad)}
                                                className={`px-3 py-1 rounded text-xs font-bold border ${ad.status === Status.ELIGIBLE ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-300 text-gray-400 bg-gray-50'}`}
                                            >
                                                {ad.status === Status.ELIGIBLE ? 'ON' : 'OFF'}
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteAd(ad.nccAdId)}
                                                className="px-3 py-1 rounded text-xs font-bold border border-red-200 text-red-500 hover:bg-red-50"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Template Modal */}
        {showTemplateModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white w-[500px] rounded-xl shadow-2xl p-6">
                    <h3 className="text-xl font-bold mb-4">소재 템플릿 일괄 등록</h3>
                    <p className="text-sm text-gray-500 mb-4">선택한 <strong className="text-naver-green">{selectedGroupIds.size}개 그룹</strong>에 아래 소재를 생성합니다.</p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">제목 (Headline)</label>
                            <input 
                                className="w-full border p-2 rounded focus:ring-2 focus:ring-naver-green focus:outline-none" 
                                maxLength={15}
                                placeholder="예: {keyword:지역} 배관 전문가"
                                value={tplHeadline}
                                onChange={e => setTplHeadline(e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1 text-right">{tplHeadline.length}/15</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">설명 (Description)</label>
                            <textarea 
                                className="w-full border p-2 rounded focus:ring-2 focus:ring-naver-green focus:outline-none resize-none h-24" 
                                maxLength={45}
                                placeholder="예: 30분내 방문, 못뚫으면 0원! 최신 장비 보유"
                                value={tplDescription}
                                onChange={e => setTplDescription(e.target.value)}
                            />
                             <p className="text-xs text-gray-400 mt-1 text-right">{tplDescription.length}/45</p>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-2 mt-6">
                        <button onClick={() => setShowTemplateModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">취소</button>
                        <button 
                            onClick={handleBulkCreate}
                            disabled={isCreating}
                            className="px-6 py-2 bg-naver-green text-white font-bold rounded hover:bg-naver-dark flex items-center"
                        >
                            {isCreating ? <Loader2 className="animate-spin mr-2 w-4 h-4"/> : <Plus className="mr-2 w-4 h-4"/>}
                            등록하기
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};