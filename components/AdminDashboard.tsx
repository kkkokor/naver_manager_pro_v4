import React, { useEffect, useState } from 'react';
import { naverService } from '../services/naverService';
import { User } from '../types';
import { Users, CheckCircle, XCircle, ShieldAlert, Clock, Ban } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const list = await naverService.getUsers();
      setUsers(list);
    } catch (e) {
      alert("관리자 권한이 없거나 목록을 불러올 수 없습니다.");
    }
  };

  const handleApprove = async (userId: number, name: string) => {
    // 개월 수 입력 받기
    const input = prompt(`${name}님의 이용 기간을 입력하세요 (단위: 개월)\n예: 1, 3, 6, 12`, "1");
    if (!input) return;
    
    const months = parseInt(input);
    if (isNaN(months) || months < 1) return alert("올바른 숫자를 입력해주세요.");

    if (!confirm(`${name}님에게 ${months}개월 이용 권한을 부여하시겠습니까?`)) return;

    try {
      await naverService.approveUser(userId, months);
      alert("승인되었습니다.");
      loadUsers(); 
    } catch (e) { alert("처리 실패"); }
  };

  const handleRevoke = async (userId: number, name: string) => {
    if (!confirm(`정말 ${name}님의 이용을 즉시 정지하시겠습니까?`)) return;
    try {
        await naverService.revokeUser(userId);
        alert("이용이 정지되었습니다.");
        loadUsers();
    } catch (e) { alert("처리 실패"); }
  };

  // 날짜 포맷팅 (2026-01-01T12:00:00 -> 2026-01-01)
  const formatDate = (dateString?: string) => {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <ShieldAlert className="w-7 h-7 mr-2 text-red-600"/> 관리자 대시보드
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-700 uppercase font-bold">
            <tr>
              <th className="px-6 py-4">아이디</th>
              <th className="px-6 py-4">이름</th>
              <th className="px-6 py-4">상태</th>
              <th className="px-6 py-4">만료 예정일</th>
              <th className="px-6 py-4 text-right">관리 기능</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-bold">{user.username}</td>
                <td className="px-6 py-4">{user.name}</td>
                <td className="px-6 py-4">
                  {user.is_superuser ? <span className="text-purple-600 font-bold border border-purple-200 bg-purple-50 px-2 py-1 rounded">관리자</span> : 
                   user.is_paid ? <span className="text-green-600 font-bold flex items-center"><CheckCircle className="w-4 h-4 mr-1"/> 이용 중</span> : 
                   <span className="text-red-500 font-bold flex items-center"><XCircle className="w-4 h-4 mr-1"/> 미승인/만료</span>}
                </td>
                <td className="px-6 py-4 text-gray-600 font-mono">
                    {user.is_superuser ? "무제한" : 
                     user.is_paid ? <span className="flex items-center text-blue-600"><Clock className="w-3 h-3 mr-1"/>{formatDate(user.subscription_expiry)}</span> : "-"}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  {!user.is_superuser && (
                    <>
                        {!user.is_paid ? (
                            <button onClick={() => handleApprove(user.id, user.name)} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-xs font-bold transition">
                            승인 (기간설정)
                            </button>
                        ) : (
                            <button onClick={() => handleRevoke(user.id, user.name)} className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 text-xs font-bold transition flex items-center ml-auto">
                            <Ban className="w-3 h-3 mr-1"/> 이용 정지
                            </button>
                        )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};