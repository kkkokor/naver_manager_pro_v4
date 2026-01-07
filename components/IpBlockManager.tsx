import React, { useEffect, useState } from 'react';
import { naverService } from '../services/naverService';
import { Shield, Trash2, Plus, Ban, Loader2 } from 'lucide-react';

interface IpItem {
  ip: string;
  memo: string;
  regDate?: string;
}

export const IpBlockManager: React.FC = () => {
  const [ipList, setIpList] = useState<IpItem[]>([]);
  const [newIp, setNewIp] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await naverService.getIpExclusions();
      setIpList(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const handleAdd = async () => {
    if (!newIp) return alert('IP를 입력하세요.');
    // IP 형식 체크 (간단)
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(newIp)) return alert('올바른 IP 형식이 아닙니다. (예: 123.123.123.123)');

    try {
      await naverService.addIpExclusion(newIp, newMemo);
      setNewIp('');
      setNewMemo('');
      fetchList();
      alert('차단 IP가 등록되었습니다.');
    } catch (e) {
      alert('등록 실패 (이미 등록되었거나 네이버 API 오류)');
    }
  };

  const handleDelete = async (ip: string) => {
    if (!confirm(`${ip} 차단을 해제하시겠습니까?`)) return;
    try {
      await naverService.deleteIpExclusion(ip);
      fetchList();
    } catch (e) {
      alert('삭제 실패');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
       <div className="flex items-center mb-6">
           <div className="bg-red-100 p-3 rounded-full mr-4">
               <Shield className="w-6 h-6 text-red-600"/>
           </div>
           <div>
               <h3 className="text-lg font-bold text-gray-800">IP 차단 관리</h3>
               <p className="text-sm text-gray-500">여기에 등록된 IP에게는 광고가 노출되지 않습니다. (최대 600개)</p>
           </div>
       </div>

       {/* 등록 폼 */}
       <div className="flex gap-2 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
           <input 
             type="text" 
             placeholder="차단할 IP (예: 211.234.56.78)" 
             className="border p-2 rounded w-48 font-mono text-sm"
             value={newIp}
             onChange={e => setNewIp(e.target.value)}
           />
           <input 
             type="text" 
             placeholder="메모 (예: 경쟁업체 의심)" 
             className="border p-2 rounded flex-1 text-sm"
             value={newMemo}
             onChange={e => setNewMemo(e.target.value)}
             onKeyDown={e => e.key === 'Enter' && handleAdd()}
           />
           <button onClick={handleAdd} className="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 flex items-center">
               <Plus className="w-4 h-4 mr-1"/> 등록
           </button>
       </div>

       {/* 목록 */}
       {loading ? (
           <div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300"/></div>
       ) : (
           <div className="overflow-hidden rounded-lg border">
               <table className="w-full text-sm text-left">
                   <thead className="bg-gray-100 text-gray-500 font-bold">
                       <tr>
                           <th className="p-3 pl-6">차단 IP</th>
                           <th className="p-3">메모</th>
                           <th className="p-3 text-right pr-6">관리</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y">
                       {ipList.length === 0 ? (
                           <tr><td colSpan={3} className="p-10 text-center text-gray-400">등록된 차단 IP가 없습니다.</td></tr>
                       ) : (
                           ipList.map((item, idx) => (
                               <tr key={idx} className="hover:bg-gray-50">
                                   <td className="p-3 pl-6 font-mono font-bold text-gray-700 flex items-center">
                                       <Ban className="w-3 h-3 text-red-400 mr-2"/>
                                       {item.ip}
                                   </td>
                                   <td className="p-3 text-gray-600">{item.memo}</td>
                                   <td className="p-3 text-right pr-6">
                                       <button onClick={() => handleDelete(item.ip)} className="text-gray-400 hover:text-red-600 transition-colors">
                                           <Trash2 className="w-4 h-4"/>
                                       </button>
                                   </td>
                               </tr>
                           ))
                       )}
                   </tbody>
               </table>
           </div>
       )}
    </div>
  );
};