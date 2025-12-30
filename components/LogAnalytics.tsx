import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { VisitLog } from '../types';
import { Shield, Search, Filter, AlertTriangle, RefreshCw, MousePointer, Globe } from 'lucide-react';

export const LogAnalytics: React.FC = () => {
    const [logs, setLogs] = useState<VisitLog[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadLogs();
        // 10초마다 자동 갱신
        const interval = setInterval(loadLogs, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadLogs = async () => {
        try {
            const data = await naverService.getVisitLogs();
            setLogs(data);
        } catch (e) { console.error(e); }
    };

    const handleBlockIp = async (ip: string, reason: string) => {
        if (!confirm(`IP [${ip}]를 네이버 광고 차단 목록에 등록하시겠습니까?\n사유: ${reason}`)) return;
        
        try {
            await naverService.addIpExclusion(ip, reason);
            alert("차단 완료! 더 이상 이 IP에는 광고가 노출되지 않습니다.");
        } catch (e) {
            alert("차단 실패 (이미 등록되었거나 오류 발생)");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <MousePointer className="w-7 h-7 mr-2 text-blue-600"/> 실시간 유입 분석 & 차단
                </h2>
                <button onClick={loadLogs} className="flex items-center text-sm text-gray-500 hover:text-blue-600">
                    <RefreshCw className="w-4 h-4 mr-1"/> 새로고침
                </button>
            </div>

            {/* 안내 박스 */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start text-sm text-blue-800">
                <Globe className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5"/>
                <div>
                    <p className="font-bold mb-1">홈페이지 추적 스크립트 안내</p>
                    <p>이 기능을 사용하려면 홈페이지의 &lt;head&gt; 태그 안에 아래 스크립트를 넣어야 합니다.</p>
                    <code className="block bg-black/10 p-2 mt-2 rounded font-mono text-xs select-all cursor-pointer">
                        {`<script src="http://내서버주소:8000/static/tracking.js"></script>`}
                    </code>
                    <p className="mt-2 text-xs text-blue-600">* 현재 로컬 실행 중이라면 외부 접속이 가능한 주소(호스팅 등)가 필요합니다.</p>
                </div>
            </div>

            {/* 로그 테이블 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b font-medium text-gray-600">
                        <tr>
                            <th className="p-4">시간</th>
                            <th className="p-4">유입 유형</th>
                            <th className="p-4">키워드</th>
                            <th className="p-4">IP 주소</th>
                            <th className="p-4 text-right">조치</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.length === 0 ? (
                            <tr><td colSpan={5} className="p-10 text-center text-gray-400">수집된 로그가 없습니다.</td></tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-500">{log.timestamp.split(' ')[1]}</td>
                                    <td className="p-4">
                                        {log.type === 'AD' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">광고(PowerLink)</span>}
                                        {log.type === 'ORGANIC' && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">검색유입</span>}
                                        {log.type === 'DIRECT' && <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs">직접/기타</span>}
                                    </td>
                                    <td className="p-4 font-bold text-gray-800">{log.keyword}</td>
                                    <td className="p-4 font-mono text-gray-600">{log.ip}</td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => handleBlockIp(log.ip, `부정클릭 의심 (${log.keyword})`)}
                                            className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center ml-auto"
                                        >
                                            <Shield className="w-3 h-3 mr-1"/> 차단
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};