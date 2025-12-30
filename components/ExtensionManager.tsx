import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Extension, Campaign } from '../types';
import { 
  Phone, MapPin, Link as LinkIcon, Image as ImageIcon, 
  Grid, Loader2, RefreshCw, AlertCircle, PhoneCall, Globe, Calculator, AlertTriangle 
} from 'lucide-react';

export const ExtensionManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadExtensions(selectedCampaignId);
    } else {
      setExtensions([]);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    try {
      const data = await naverService.getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error("캠페인 로딩 실패:", error);
    }
  };

  const loadExtensions = async (campaignId: string) => {
    setLoading(true);
    try {
      const data = await naverService.getExtensions(campaignId);
      setExtensions(data);
    } catch (error) {
      console.error("확장소재 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'ALL', label: '전체 보기', icon: Grid },
    { id: 'PHONE', label: '전화번호', icon: Phone },
    { id: 'LOCATION', label: '위치정보', icon: MapPin },
    { id: 'SUB_LINKS', label: '서브링크', icon: LinkIcon },
    { id: 'PRICE_LINKS', label: '가격링크', icon: Calculator },
    { id: 'POWER_LINK_IMAGE', label: '파워링크이미지', icon: ImageIcon },
    { id: 'IMAGES', label: '이미지', icon: ImageIcon },
  ];

  const filteredExtensions = activeTab === 'ALL' 
    ? extensions 
    : extensions.filter(e => e.type === activeTab);

  const renderExtensionContent = (ext: Extension) => {
    const details = ext.extension || {}; 

    switch (ext.type) {
      case 'PHONE':
        return (
          <div className="flex items-center text-gray-700">
            <PhoneCall className="w-4 h-4 mr-2 text-green-600"/>
            <span className="font-bold">{details.phoneNumber || '전화번호 정보 없음'}</span>
          </div>
        );
      case 'LOCATION':
        return (
          <div className="text-sm">
            <div className="font-bold flex items-center"><MapPin className="w-3 h-3 mr-1 text-blue-500"/> {details.businessName || '업체명 없음'}</div>
            <div className="text-gray-500 text-xs mt-1">{details.roadAddress || details.address || ''}</div>
          </div>
        );
      case 'SUB_LINKS':
        return (
          <div className="text-sm">
             <div className="font-bold mb-1">서브링크 목록</div>
             {details.links && Array.isArray(details.links) && details.links.map((link: any, i: number) => (
                 <div key={i} className="text-xs text-gray-600 truncate">- {link.linkName} ({link.pcUrl})</div>
             ))}
          </div>
        );
      case 'POWER_LINK_IMAGE':
      case 'IMAGES':
        return (
           <div className="flex items-center gap-3">
             {details.imgUrl && <img src={details.imgUrl} alt="확장소재" className="w-16 h-16 object-cover rounded border"/>}
             <div>
               <div className="font-bold text-sm">{details.title || '이미지'}</div>
               <div className="text-xs text-gray-500">{details.description || ''}</div>
             </div>
           </div>
        );
      default: 
        return (
          <div className="text-xs text-gray-500 break-all">
            {JSON.stringify(details).slice(0, 100)}...
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
           <Grid className="w-6 h-6 mr-2 text-indigo-600"/> 확장소재 관리
        </h2>
        
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-1">캠페인 선택 (필수)</label>
            <select 
              value={selectedCampaignId} 
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">-- 캠페인을 선택해주세요 --</option>
              {campaigns.map(c => (
                <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>
              ))}
            </select>
          </div>
          
          {selectedCampaignId && (
             <button onClick={() => loadExtensions(selectedCampaignId)} className="mt-6 p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="새로고침">
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}/>
             </button>
          )}
        </div>
      </div>

      {selectedCampaignId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
          <div className="flex border-b overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
                  ${activeTab === tab.id 
                    ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <tab.icon className="w-4 h-4 mr-2"/>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6 flex-1 bg-gray-50">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-2"/>
                데이터를 불러오는 중입니다...
              </div>
            ) : filteredExtensions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredExtensions.map((ext, idx) => (
                  <div key={ext.nccExtensionId || idx} className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow relative">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ext.userLock ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                          {ext.userLock ? 'OFF' : 'ON'}
                        </span>
                        {/* 검수 상태 표시 */}
                        {ext.inspectStatus && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ext.inspectStatus === 'APPROVED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {ext.inspectStatus}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{ext.type}</span>
                    </div>
                    
                    <div className="mb-4">
                      {renderExtensionContent(ext)}
                    </div>

                    {/* 반려 사유 표시 */}
                    {ext.statusReason && ext.statusReason !== 'ELIGIBLE' && (
                      <div className="text-xs text-red-500 mt-2 bg-red-50 p-1 rounded flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-1"/>
                        {ext.statusReason}
                      </div>
                    )}

                    <div className="text-right mt-2 pt-2 border-t border-gray-100">
                      <button className="text-xs text-gray-400 hover:text-red-500 underline">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50"/>
                <p>등록된 '{tabs.find(t=>t.id===activeTab)?.label}' 확장소재가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 text-gray-400">
          <Grid className="w-12 h-12 mb-4 opacity-20"/>
          <p className="text-lg font-medium">관리할 캠페인을 먼저 선택해주세요.</p>
        </div>
      )}
    </div>
  );
};