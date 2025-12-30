import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Extension, Campaign } from '../types';
import { 
  Phone, MapPin, Link as LinkIcon, Image as ImageIcon, 
  Grid, Loader2, RefreshCw, AlertCircle, PhoneCall, Globe 
} from 'lucide-react';

export const ExtensionManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');

  // 1. 처음 들어오면 캠페인 목록부터 가져옴
  useEffect(() => {
    loadCampaigns();
  }, []);

  // 2. 캠페인을 선택하면 확장소재 목록을 가져옴
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

  // 탭 변경 함수
  const tabs = [
    { id: 'ALL', label: '전체 보기', icon: Grid },
    { id: 'PHONE_NUMBER', label: '전화번호', icon: Phone },
    { id: 'PLACE', label: '위치정보', icon: MapPin },
    { id: 'ADDITIONAL_LINK', label: '추가링크', icon: LinkIcon },
    { id: 'MOBILE_IMAGE', label: '모바일이미지', icon: ImageIcon },
  ];

  const filteredExtensions = activeTab === 'ALL' 
    ? extensions 
    : extensions.filter(e => e.type === activeTab);

  // 확장소재 내용 렌더링 도우미
  const renderExtensionContent = (ext: Extension) => {
    const details = ext.extension || {}; // 세부 속성

    switch (ext.type) {
      case 'PHONE_NUMBER':
        return (
          <div className="flex items-center text-gray-700">
            <PhoneCall className="w-4 h-4 mr-2 text-green-600"/>
            <span className="font-bold">{details.phoneNumber || '전화번호 정보 없음'}</span>
          </div>
        );
      case 'PLACE':
        return (
          <div className="text-sm">
            <div className="font-bold flex items-center"><MapPin className="w-3 h-3 mr-1 text-blue-500"/> {details.businessName || '업체명 없음'}</div>
            <div className="text-gray-500 text-xs mt-1">{details.roadAddress || details.address || ''}</div>
          </div>
        );
      case 'ADDITIONAL_LINK':
        return (
          <div className="text-sm">
             <div className="font-bold">{details.linkName || '링크명 없음'}</div>
             <a href={details.pcUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs flex items-center mt-1">
               <Globe className="w-3 h-3 mr-1"/> {details.pcUrl}
             </a>
          </div>
        );
      case 'MOBILE_IMAGE':
        return (
           <div className="flex items-center gap-3">
             {details.imgUrl && <img src={details.imgUrl} alt="확장소재" className="w-16 h-16 object-cover rounded border"/>}
             <div>
               <div className="font-bold text-sm">{details.title || '이미지 제목'}</div>
               <div className="text-xs text-gray-500">{details.description || ''}</div>
             </div>
           </div>
        );
      default: // 기타(블로그 등)
        return (
          <div className="text-xs text-gray-500">
            {JSON.stringify(details).slice(0, 50)}...
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 헤더 & 캠페인 선택 */}
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

      {/* 2. 메인 컨텐츠 영역 */}
      {selectedCampaignId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
          
          {/* 탭 메뉴 */}
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

          {/* 목록 표시 */}
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
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ext.userLock ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                        {ext.userLock ? 'OFF (중지)' : 'ON (노출중)'}
                      </span>
                      <span className="text-xs text-gray-400">{ext.type}</span>
                    </div>
                    
                    <div className="mb-4">
                      {renderExtensionContent(ext)}
                    </div>

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
        // 캠페인 미선택 시 안내 화면
        <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 text-gray-400">
          <Grid className="w-12 h-12 mb-4 opacity-20"/>
          <p className="text-lg font-medium">관리할 캠페인을 먼저 선택해주세요.</p>
          <p className="text-sm">상단 드롭다운에서 캠페인을 선택하면 확장소재가 표시됩니다.</p>
        </div>
      )}
    </div>
  );
};