import React, { useState, useEffect } from 'react';
import { Campaign } from '../types';
import { 
  ComposedChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, MousePointer2, DollarSign, Target, Percent, BarChart3, Calendar, ArrowUpRight, ArrowDownRight, Search 
} from 'lucide-react';

interface DashboardProps {
  campaigns: Campaign[];
  onDateChange: (since: string, until: string) => void;
}

const StatCard = ({ title, value, subtext, icon: Icon, color, trend }: any) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-1">{title}</p>
        <h3 className="text-2xl font-extrabold text-gray-800 tracking-tight">{value}</h3>
      </div>
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-xs">
      {trend === 'up' ? <ArrowUpRight className="w-3 h-3 text-red-500 mr-1"/> : <ArrowDownRight className="w-3 h-3 text-blue-500 mr-1"/>}
      <span className="text-gray-400">{subtext}</span>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ campaigns, onDateChange }) => {
  // 기본값: 오늘 날짜
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // [수정] 모든 캠페인 데이터 포함 (상태 필터링 제거)
  const allCampaigns = campaigns;

  // 날짜 변경 시 데이터 재요청
  useEffect(() => {
    if (startDate && endDate) {
        onDateChange(startDate, endDate);
    }
  }, [startDate, endDate]);

  // 전체 합계 계산
  const totalStats = allCampaigns.reduce((acc, curr) => ({
    impressions: acc.impressions + (curr.stats.impressions || 0),
    clicks: acc.clicks + (curr.stats.clicks || 0),
    cost: acc.cost + (curr.stats.cost || 0),
    conversions: acc.conversions + (curr.stats.conversions || 0),
    convAmt: acc.convAmt + (curr.stats.convAmt || 0),
    ctr: 0, cpc: 0, cpa: 0, roas: 0
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, convAmt: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0 });

  if (totalStats.impressions > 0) totalStats.ctr = (totalStats.clicks / totalStats.impressions) * 100;
  if (totalStats.clicks > 0) totalStats.cpc = totalStats.cost / totalStats.clicks;
  if (totalStats.conversions > 0) totalStats.cpa = totalStats.cost / totalStats.conversions;
  if (totalStats.cost > 0) totalStats.roas = (totalStats.convAmt / totalStats.cost) * 100;

  // 차트 데이터 (비용 상위 10개)
  const chartData = allCampaigns
    .sort((a, b) => b.stats.cost - a.stats.cost)
    .slice(0, 10)
    .map(c => ({
      name: c.name,
      cost: c.stats.cost,
      conversions: c.stats.conversions,
      roas: c.stats.roas || 0
    }));

  return (
    <div className="space-y-6 pb-10">
      {/* 헤더 & 날짜 선택 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-naver-green"/> 통합 대시보드
          </h2>
          <p className="text-gray-500 text-sm mt-1">기간별 전체 캠페인 성과 분석</p>
        </div>
        
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
            <div className="flex items-center">
                <Calendar className="w-4 h-4 text-gray-500 mr-2"/>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-700 text-sm rounded-md p-1.5 focus:ring-2 focus:ring-naver-green focus:border-naver-green outline-none"
                />
            </div>
            <span className="text-gray-400 font-bold">~</span>
            <div className="flex items-center">
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-700 text-sm rounded-md p-1.5 focus:ring-2 focus:ring-naver-green focus:border-naver-green outline-none"
                />
            </div>
            <button 
                onClick={() => onDateChange(startDate, endDate)}
                className="bg-naver-green text-white p-2 rounded-md hover:bg-green-600 transition-colors ml-1"
                title="조회"
            >
                <Search className="w-4 h-4"/>
            </button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
            title="총 비용 (Cost)" 
            value={`₩${totalStats.cost.toLocaleString()}`} 
            subtext="전체 지출" 
            icon={DollarSign} 
            color="bg-gray-800" 
            trend="up"
        />
        <StatCard 
            title="ROAS (수익률)" 
            value={`${totalStats.roas.toFixed(0)}%`} 
            subtext={`매출 ₩${totalStats.convAmt.toLocaleString()}`} 
            icon={TrendingUp} 
            color="bg-red-500" 
            trend="up"
        />
        <StatCard 
            title="총 전환수 (CV)" 
            value={`${totalStats.conversions.toLocaleString()}건`} 
            subtext={`CPA ₩${Math.round(totalStats.cpa).toLocaleString()}`} 
            icon={Target} 
            color="bg-blue-500" 
            trend="up"
        />
        <StatCard 
            title="클릭률 (CTR)" 
            value={`${totalStats.ctr.toFixed(2)}%`} 
            subtext={`클릭 ${totalStats.clicks.toLocaleString()} / 노출 ${totalStats.impressions.toLocaleString()}`} 
            icon={MousePointer2} 
            color="bg-green-500" 
            trend="down"
        />
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[400px]">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
                <Percent className="w-5 h-5 mr-2 text-blue-600"/> 캠페인별 비용 & ROAS (Top 10)
            </h3>
            <ResponsiveContainer width="100%" height="85%">
                <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                    <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} angle={-15} textAnchor="end" height={60}/>
                    <YAxis yAxisId="left" orientation="left" tick={{fontSize: 11}} stroke="#8884d8"/>
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 11}} stroke="#ff7300" unit="%"/>
                    <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number, name: string) => [
                            name === 'cost' ? `₩${value.toLocaleString()}` : (name === 'roas' ? `${value.toFixed(0)}%` : value),
                            name === 'cost' ? '비용' : (name === 'roas' ? 'ROAS' : name)
                        ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="cost" name="비용" fill="#cbd5e1" barSize={20} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#ff7300" strokeWidth={3} dot={{r: 4}} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[400px]">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
                <Target className="w-5 h-5 mr-2 text-red-500"/> 전환수 Top 5
            </h3>
            <ResponsiveContainer width="100%" height="85%">
                <BarChart data={chartData.slice(0, 5)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0"/>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11}}/>
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px' }}/>
                    <Bar dataKey="conversions" name="전환수" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-700">📌 캠페인별 상세 성과 (전체)</h3>
              <span className="text-xs text-gray-400">비용 내림차순 정렬</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-white text-gray-500 border-b">
                    <tr>
                        <th className="p-4 font-medium">캠페인명</th>
                        <th className="p-4 font-medium text-right">상태</th>
                        <th className="p-4 font-medium text-right">노출수</th>
                        <th className="p-4 font-medium text-right">클릭수</th>
                        <th className="p-4 font-medium text-right">클릭률</th>
                        <th className="p-4 font-medium text-right text-blue-600">총 비용</th>
                        <th className="p-4 font-medium text-right">전환수</th>
                        <th className="p-4 font-medium text-right text-red-600">ROAS</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {allCampaigns.sort((a,b) => b.stats.cost - a.stats.cost).map((c) => (
                        <tr key={c.nccCampaignId} className={`hover:bg-gray-50 transition-colors ${c.stats.cost === 0 ? 'opacity-50' : ''}`}>
                            <td className="p-4 font-bold text-gray-800">{c.name}</td>
                            <td className="p-4 text-right">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${c.status === 'ELIGIBLE' || c.status === 'ON' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {c.status}
                                </span>
                            </td>
                            <td className="p-4 text-right text-gray-600">{c.stats.impressions.toLocaleString()}</td>
                            <td className="p-4 text-right text-gray-600">{c.stats.clicks.toLocaleString()}</td>
                            <td className="p-4 text-right text-gray-600">{c.stats.ctr}%</td>
                            <td className="p-4 text-right font-bold text-blue-600">₩{c.stats.cost.toLocaleString()}</td>
                            <td className="p-4 text-right font-bold text-gray-800">{c.stats.conversions.toLocaleString()}</td>
                            <td className="p-4 text-right font-bold text-red-600">{c.stats.roas?.toFixed(0)}%</td>
                        </tr>
                    ))}
                    {allCampaigns.length === 0 && (
                        <tr><td colSpan={8} className="p-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
          </div>
      </div>
    </div>
  );
};