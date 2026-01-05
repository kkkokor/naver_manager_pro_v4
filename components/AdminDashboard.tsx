import React, { useEffect, useState } from 'react';
import { naverService } from '../services/naverService';
import { User } from '../types';
import { Users, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';

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
    if (!confirm(`${name}님의 결제를 확인하고 승인하시겠습니까?`)) return;
    try {
      await naverService.approveUser(userId);
      loadUsers(); // 새로고침
    } catch (e) { alert("처리 실패"); }
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
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">아이디</th>
              <th className="px-6 py-4">이름 (입금자)</th>
              <th className="px-6 py-4">상태</th>
              <th className="px-6 py-4">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono">{user.id}</td>
                <td className="px-6 py-4 font-bold">{user.username}</td>
                <td className="px-6 py-4">{user.name}</td>
                <td className="px-6 py-4">
                  {user.is_superuser ? <span className="text-purple-600 font-bold">관리자</span> : 
                   user.is_paid ? <span className="text-green-600 font-bold flex items-center"><CheckCircle className="w-4 h-4 mr-1"/> 승인됨</span> : 
                   <span className="text-red-500 font-bold flex items-center"><XCircle className="w-4 h-4 mr-1"/> 미승인 (입금대기)</span>}
                </td>
                <td className="px-6 py-4">
                  {!user.is_paid && !user.is_superuser && (
                    <button onClick={() => handleApprove(user.id, user.name)} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-xs font-bold">
                      승인 처리
                    </button>
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