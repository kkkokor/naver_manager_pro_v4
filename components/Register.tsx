import React, { useState } from 'react';
import { naverService } from '../services/naverService';
import { UserPlus, Loader2 } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export const Register: React.FC<Props> = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({ username: '', password: '', name: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await naverService.register(formData);
      alert('가입이 완료되었습니다! 로그인해주세요.');
      onSuccess();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center justify-center">
          <UserPlus className="w-8 h-8 mr-2 text-indigo-600"/> 회원가입
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">아이디</label>
            <input type="text" required className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">비밀번호</label>
            <input type="password" required className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">이름 (입금자명)</label>
            <input type="text" required className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="홍길동"
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">연락처</label>
            <input type="text" required className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="010-0000-0000"
              value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex justify-center items-center">
            {loading ? <Loader2 className="animate-spin"/> : '가입하기'}
          </button>
          <button type="button" onClick={onCancel} className="w-full text-gray-500 text-sm hover:underline">
            취소하고 로그인하기
          </button>
        </form>
      </div>
    </div>
  );
};