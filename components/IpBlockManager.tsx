import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Shield, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

export const IpBlockManager: React.FC = () => {
    const [ipList, setIpList] = useState<{ip: string, memo: string, regRegDate?: string}[]>([]);
    const [loading, setLoading] = useState(false);
    const [newIp, setNewIp] = useState('');
    const [newMemo, setNewMemo] = useState('');

    useEffect(() => {
        loadIpList();
    }, []);

    const loadIpList = async () => {
        setLoading(true);
        try {
            const data = await naverService.getIpExclusions();
            // 데이터 형식이 [{ip:..., memo:...}] 라고 가정
            setIpList(data || []);
        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newIp) return alert("IP를 입력하세요.");
        // IP 정규식 체크 (선택)
        const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
        if (!ipRegex.test(newIp)) return alert("올바른 IP 형식이 아닙니다.");

        try {
            await naverService.addIpExclusion(newIp, newMemo);
            setNewIp('');
            setNewMemo('');
            loadIpList();
            alert("차단 등록되었습니다.");
        } catch(e) {
            alert("등록 실패");
        }
    };

    const handleDelete = async (ip: string) => {
        if (!confirm(`${ip} 차단을 해제하시겠습니까?`)) return;
        try {
            await naverService.deleteIpExclusion(ip);
            loadIpList();
        } catch(e) {
            alert("삭제 실패");
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <Shield className="w-7 h-7 mr-2 text-red-600"/> 부정클릭 IP 차단 관리
            </h2>
            
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 text-sm text-orange-800 flex items-start">
                <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0"/>
                <div>
                    <p className="font-bold">주의사항</p>
                    <p>네이버 API는 '누가 클릭했는지' 알려주지 않습니다. 호스팅 서버 로그나 에이스카운터 등 외부 툴에서 의심 IP를 확인한 후 여기에 입력해주세요.</p>
                    <p className="mt-1">* 최대 600개까지 등록 가능합니다.</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex gap-4 mb-6">
                    <input 
                        type="text" 
                        placeholder="차단할 IP (예: 123.45.67.89)" 
                        className="border p-2 rounded w-64"
                        value={newIp}
                        onChange={e => setNewIp(e.target.value)}
                    />
                    <input 
                        type="text" 
                        placeholder="메모 (예: 경쟁사 의심)" 
                        className="border p-2 rounded flex-1"
                        value={newMemo}
                        onChange={e => setNewMemo(e.target.value)}
                    />
                    <button onClick={handleAdd} className="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 flex items-center">
                        <Plus className="w-4 h-4 mr-2"/> 차단 등록
                    </button>
                </div>

                <div className="overflow-hidden border rounded-lg">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3 font-bold text-gray-600">IP 주소</th>
                                <th className="p-3 font-bold text-gray-600">메모</th>
                                <th className="p-3 font-bold text-gray-600 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={3} className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400"/></td></tr>
                            ) : ipList.length === 0 ? (
                                <tr><td colSpan={3} className="p-10 text-center text-gray-400">차단된 IP가 없습니다.</td></tr>
                            ) : (
                                ipList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-800">{item.ip}</td>
                                        <td className="p-3 text-gray-600">{item.memo}</td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleDelete(item.ip)} className="text-red-500 hover:text-red-700 p-1">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};