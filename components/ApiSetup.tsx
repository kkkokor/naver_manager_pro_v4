import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Key, Save, Loader2 } from 'lucide-react';

export const ApiSetup: React.FC = () => {
  const [keys, setKeys] = useState({ naver_access_key: '', naver_secret_key: '', naver_customer_id: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 기존 키 불러오기 (보안상 마스킹 처리되어 올 수도 있음)
    // 여기서는 편의상 입력창을 비워두거나, 필요시 getMe()에서 받아온 값 채우기 가능
  }, []);

  const handleSave = async () => {
    if (!keys.naver_access_key || !keys.naver_secret_key || !keys.naver_customer_id) {
        alert("모든 항목을 입력해주세요.");
        return;
    }
    setLoading(true);
    try {
      await naverService.saveApiKeys(keys);
      alert("API 키가 안전하게 저장되었습니다. 이제 모든 기능을 사용할 수 있습니다.");
    } catch (e) {
      alert("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <Key className="w-6 h-6 mr-2 text-indigo-600"/> 네이버 API 연동 설정
      </h2>
      <p className="text-sm text-gray-500 mb-6 bg-gray-50 p-4 rounded-lg">
        네이버 검색광고 API 키를 입력해주세요. 입력된 키는 서버에 안전하게 암호화되어 저장됩니다.
        <br/>(한 번만 설정하면 이후에는 로그인만으로 사용 가능합니다.)
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Access License Key</label>
          <input type="text" className="w-full border p-3 rounded-lg font-mono text-sm" 
            value={keys.naver_access_key} onChange={e => setKeys({...keys, naver_access_key: e.target.value})} />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Secret Key</label>
          <input type="password" className="w-full border p-3 rounded-lg font-mono text-sm" 
            value={keys.naver_secret_key} onChange={e => setKeys({...keys, naver_secret_key: e.target.value})} />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Customer ID</label>
          <input type="text" className="w-full border p-3 rounded-lg font-mono text-sm" 
            value={keys.naver_customer_id} onChange={e => setKeys({...keys, naver_customer_id: e.target.value})} />
        </div>

        <button onClick={handleSave} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 flex justify-center items-center">
          {loading ? <Loader2 className="animate-spin"/> : <><Save className="w-4 h-4 mr-2"/> 저장하기</>}
        </button>
      </div>
    </div>
  );
};