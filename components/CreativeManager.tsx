import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Campaign, AdGroup, Ad } from '../types';
import { 
  FileText, Plus, Trash2, Power, Loader2, Megaphone, 
  CheckCircle, AlertCircle, Layout, RefreshCw  // [수정] 여기가 빠져있었습니다!
} from 'lucide-react';

export const CreativeManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedAdGroupId, setSelectedAdGroupId] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  
  // 새 소재 입력 상태
  const [newHeadline, setNewHeadline] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadAdGroups(selectedCampaignId);
      setAds([]);
      setSelectedAdGroupId('');
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    if (selectedAdGroupId) {
      loadAds(selectedAdGroupId);
    }
  }, [selectedAdGroupId]);

  const loadCampaigns = async () => {
    try {
      const data = await naverService.getCampaigns();
      setCampaigns(data);
    } catch (e) { console.error(e); }
  };

  const loadAdGroups = async (campId: string) => {
    try {
      const data = await naverService.getAdGroups(campId);
      setAdGroups(data);
    } catch (e) { console.error(e); }
  };

  const loadAds = async (groupId: string) => {
    setLoading(true);
    try {
      // 캠페인 ID 없이 그룹 ID만으로 조회 (더 정확함)
      const data = await naverService.getAds(undefined, groupId);
      setAds(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreateAd = async () => {
    if (!newHeadline || !newDesc || !selectedAdGroupId) return;
    setIsCreating(true);
    try {
      await naverService.createAd(selectedAdGroupId, newHeadline, newDesc);
      await loadAds(selectedAdGroupId);
      setNewHeadline('');
      setNewDesc('');
      alert('소재가 등록되었습니다.');
    } catch (e) {
      alert('등록 실패: ' + e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAd = async (adId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await naverService.deleteAd(adId);
      setAds(prev => prev.filter(a => a.nccAdId !== adId));
    } catch (e) { alert('삭제 실패'); }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
           <Megaphone className="w-6 h-6 mr-2 text-orange-500"/> 소재(T&D) 관리
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">캠페인</label>
            <select 
              className="w-full border p-2 rounded" 
              value={selectedCampaignId} 
              onChange={e => setSelectedCampaignId(e.target.value)}
            >
              <option value="">선택하세요</option>
              {campaigns.map(c => <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">광고그룹</label>
            <select 
              className="w-full border p-2 rounded" 
              value={selectedAdGroupId} 
              onChange={e => setSelectedAdGroupId(e.target.value)}
              disabled={!selectedCampaignId}
            >
              <option value="">선택하세요</option>
              {adGroups.map(g => <option key={g.nccAdGroupId} value={g.nccAdGroupId}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedAdGroupId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* 입력 폼 */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <h3 className="font-bold text-lg mb-4 flex items-center"><Plus className="w-5 h-5 mr-2"/> 새 소재 등록</h3>
            <div className="space-y-3 flex-1">
              <div>
                <label className="text-xs font-bold text-gray-500">제목 (Headline)</label>
                <input 
                  className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-200 outline-none" 
                  maxLength={15} 
                  value={newHeadline} 
                  onChange={e => setNewHeadline(e.target.value)}
                  placeholder="제목 입력 (최대 15자)"
                />
                <div className="text-right text-xs text-gray-400 mt-1">{newHeadline.length}/15</div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">설명 (Description)</label>
                <textarea 
                  className="w-full border p-2 rounded mt-1 h-24 resize-none focus:ring-2 focus:ring-orange-200 outline-none" 
                  maxLength={45}
                  value={newDesc} 
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="설명 입력 (최대 45자)"
                />
                <div className="text-right text-xs text-gray-400 mt-1">{newDesc.length}/45</div>
              </div>
            </div>
            <button 
              onClick={handleCreateAd} 
              disabled={isCreating || !newHeadline || !newDesc}
              className="w-full bg-gray-800 text-white py-3 rounded-lg font-bold hover:bg-black mt-4 flex justify-center items-center"
            >
              {isCreating ? <Loader2 className="animate-spin"/> : '등록하기'}
            </button>
          </div>

          {/* 목록 */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex justify-between">
              <span>등록된 소재 목록 ({ads.length})</span>
              <button onClick={() => loadAds(selectedAdGroupId)}><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {ads.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <Layout className="w-10 h-10 mb-2 opacity-30"/>
                  <p>등록된 소재가 없습니다.</p>
                </div>
              )}
              
              {ads.map(ad => (
                <div key={ad.nccAdId} className="bg-white p-4 rounded-lg border hover:border-orange-300 transition-colors shadow-sm group">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ad.status ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {ad.status ? 'OFF' : 'ON'}
                    </span>
                    <button onClick={() => handleDeleteAd(ad.nccAdId)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                  <div className="text-blue-600 font-bold text-lg mb-1">{ad.headline}</div>
                  <div className="text-gray-600 text-sm">{ad.description}</div>
                  <div className="text-green-600 text-xs mt-1 truncate">www.yoursite.com</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};