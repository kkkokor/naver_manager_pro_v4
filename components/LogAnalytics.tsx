import React, { useEffect, useState } from 'react';
import { naverService } from '../services/naverService';
import { ShieldAlert, Search, MousePointer, AlertTriangle, RefreshCcw } from 'lucide-react';
import { IpBlockManager } from './IpBlockManager';

interface VisitLog {
  id: string;
  timestamp: string;
  ip: string;
  type: string;
  keyword: string;
  url: string;
  referrer: string;
}

export const LogAnalytics: React.FC = () => {
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'LOGS' | 'BLOCK'>('LOGS');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await naverService.getVisitLogs();
      setLogs(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <MousePointer className="w-7 h-7 mr-2 text-blue-600"/>
            유입 분석 및 차단
          </h2>
          <p className="text-gray-500 text-sm mt-1 ml-9">
            실시간 방문자를 분석하고 부정 클릭 의심 IP를 차단합니다.
          </p>
        </div>
        <div className="bg-gray-100 p-1 rounded-lg flex text-sm font-bold">
            <button onClick={() => setActiveTab('LOGS')} className={`px-4 py-2 rounded-md transition-all ${activeTab === 'LOGS' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                실시간 유입 로그
            </button>
            <button onClick={() => setActiveTab('BLOCK')} className={`px-4 py-2 rounded-md transition-all ${activeTab === 'BLOCK' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>
                IP 차단 관리
            </button>
        </div>
      </div>

      {activeTab === 'LOGS' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-700 flex items-center">
                    <Search className="w-4 h-4 mr-2"/> 방문 기록 (최근 1000건)
                </h3>
                <button onClick={fetchLogs} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                    <RefreshCcw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`}/>
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                        <tr>
                            <th className="p-3 w-40">시간</th>
                            <th className="p-3 w-32">IP 주소</th>
                            <th className="p-3 w-24">유입 유형</th>
                            <th className="p-3 w-40">검색 키워드</th>
                            <th className="p-3">상세 경로 (Referrer)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.length === 0 ? (
                            <tr><td colSpan={5} className="p-10 text-center text-gray-400">아직 수집된 데이터가 없습니다.</td></tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-600">{log.timestamp}</td>
                                    <td className="p-3 font-mono font-bold text-blue-600">{log.ip}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'AD' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {log.type === 'AD' ? '광고 클릭' : '일반 접속'}
                                        </span>
                                    </td>
                                    <td className="p-3 font-bold text-gray-800">{log.keyword || '-'}</td>
                                    <td className="p-3 text-gray-400 text-xs truncate max-w-xs" title={log.referrer}>
                                        {log.referrer || '(직접 접속)'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      ) : (
          <IpBlockManager />
      )}
    </div>
  );
};