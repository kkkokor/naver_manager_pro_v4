import React, { useState } from 'react';
// ▼▼▼ [수정] 여기에 'List'를 추가했습니다! ▼▼▼
import { BookOpen, Zap, Target, Shield, MousePointer, Key, Layers, Image, TrendingUp, HelpCircle, List } from 'lucide-react';

export const Manual: React.FC = () => {
  const [activeSection, setActiveSection] = useState('start');

  const sections = [
    { id: 'start', label: '시작하기 (회원가입/승인)', icon: Key },
    { id: 'autobid', label: '스마트 자동 입찰', icon: Zap },
    { id: 'security', label: '부정 클릭 차단', icon: Shield },
    { id: 'ads', label: '광고 소재 관리', icon: Image },
    { id: 'keywords', label: '키워드 확장', icon: TrendingUp },
  ];

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center mb-8">
        <div className="bg-blue-600 p-3 rounded-lg mr-4 shadow-lg">
          <BookOpen className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">사용 가이드</h2>
          <p className="text-gray-500 mt-1">네이버 검색광고 매니저 Pro의 모든 기능을 100% 활용하는 방법</p>
        </div>
      </div>

      <div className="flex gap-8 items-start">
        {/* 왼쪽 목차 (PC에서만 보임) */}
        <div className="hidden lg:block w-64 sticky top-4 space-y-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollTo(section.id)}
              className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-all ${
                activeSection === section.id 
                  ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200 shadow-sm' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <section.icon className="w-4 h-4 mr-3" />
              {section.label}
            </button>
          ))}
          
          <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-sm text-yellow-800">
            <h4 className="font-bold flex items-center mb-2"><HelpCircle className="w-4 h-4 mr-2"/> 문의하기</h4>
            <p>사용 중 어려움이 있으신가요?</p>
            <p className="font-bold mt-1">010-8839-8387</p>
            <p>(최지용 대표)</p>
          </div>
        </div>

        {/* 오른쪽 본문 */}
        <div className="flex-1 space-y-12">
          
          {/* 1. 시작하기 */}
          <section id="start" className="scroll-mt-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
              <Key className="w-6 h-6 mr-2 text-blue-500" /> 시작하기 & API 설정
            </h3>
            <div className="space-y-6 text-gray-600 leading-relaxed">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h4 className="font-bold text-blue-800 mb-2">📢 승인 절차 안내</h4>
                <p>회원가입 직후에는 기능이 잠겨있습니다. <strong>입금 후 관리자에게 연락</strong>주시면 즉시 승인 처리해 드립니다.</p>
              </div>
              
              <div>
                <h4 className="font-bold text-lg text-gray-800 mb-2">1. 네이버 광고 API 키 발급받기</h4>
                <p className="mb-2">프로그램이 내 광고를 대신 관리하려면 '열쇠(API Key)'가 필요합니다.</p>
                <ol className="list-decimal list-inside space-y-2 bg-gray-50 p-4 rounded-lg text-sm">
                  <li><a href="https://searchad.naver.com/" target="_blank" className="text-blue-600 underline hover:text-blue-800">네이버 검색광고 센터</a>에 로그인합니다.</li>
                  <li>상단 메뉴 <strong>[도구] &gt; [API 사용 관리]</strong>로 이동합니다.</li>
                  <li><strong>[네이버 검색광고 API 서비스 신청]</strong> 버튼을 누릅니다. (이미 있다면 생략)</li>
                  <li><strong>Access License</strong>, <strong>Secret Key</strong>, <strong>Customer ID</strong> 세 가지 정보를 복사합니다.</li>
                </ol>
              </div>

              <div>
                <h4 className="font-bold text-lg text-gray-800 mb-2">2. 프로그램에 입력하기</h4>
                <p>왼쪽 메뉴 하단 <strong>[설정 &gt; API 연동 설정]</strong>에 들어가서 위 3가지 정보를 붙여넣고 저장하세요.</p>
                <p className="text-sm text-red-500 mt-1">* 이 정보는 암호화되어 안전하게 저장되며, 오직 광고 관리에만 사용됩니다.</p>
              </div>
            </div>
          </section>

          {/* 2. 자동 입찰 */}
          <section id="autobid" className="scroll-mt-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
              <Zap className="w-6 h-6 mr-2 text-yellow-500" /> 스마트 자동 입찰
            </h3>
            <div className="space-y-6 text-gray-600">
              <p>24시간 잠들지 않고 내 광고 순위를 조절합니다. 두 가지 모드를 지원합니다.</p>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border p-4 rounded-xl hover:shadow-md transition-shadow">
                  <h4 className="font-bold text-naver-green flex items-center mb-2"><List className="w-4 h-4 mr-2"/> 선택 입찰 모드 (추천)</h4>
                  <p className="text-sm">캠페인 목록에서 <strong>원하는 그룹을 체크(v)</strong>하면, 그 그룹에 속한 모든 키워드를 자동으로 관리합니다. 가장 기본적이고 강력한 모드입니다.</p>
                </div>
                <div className="border p-4 rounded-xl hover:shadow-md transition-shadow">
                  <h4 className="font-bold text-red-500 flex items-center mb-2"><Target className="w-4 h-4 mr-2"/> 저격 입찰 모드</h4>
                  <p className="text-sm">특정 <strong>핵심 키워드 몇 개만</strong> 집중적으로 관리하고 싶을 때 사용합니다. 키워드를 검색해서 등록하면 그것만 핀셋처럼 관리합니다.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-5 rounded-lg space-y-3 text-sm">
                <h4 className="font-bold text-gray-800">⚙️ 주요 설정 용어 설명</h4>
                <ul className="space-y-2">
                  <li><strong>• 목표 순위:</strong> 내 광고를 몇 위에 올릴지 설정합니다. (보통 3~4위가 가성비가 좋습니다.)</li>
                  <li><strong>• 순위권 한도:</strong> "1위를 하고 싶지만, 3만원 넘으면 포기해!" (최대 지출 금액 설정)</li>
                  <li><strong>• 탐색 한도:</strong> 순위에 없을 때, 얼마까지 올려보며 자리를 찾을지 정합니다.</li>
                  <li><strong>• 신뢰 노출수:</strong> 노출수가 너무 적은 키워드는 순위 정보가 부정확하므로 입찰을 건너뜁니다. (안전장치)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. 부정 클릭 차단 */}
          <section id="security" className="scroll-mt-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
              <Shield className="w-6 h-6 mr-2 text-red-600" /> 유입 분석 & 부정 클릭 차단
            </h3>
            <div className="space-y-4 text-gray-600">
              <p>경쟁업체의 악의적인 클릭으로 광고비가 줄줄 새고 있나요? 여기서 잡으세요.</p>
              
              <div className="flex flex-col md:flex-row gap-6 items-start">
                 <div className="flex-1">
                    <h4 className="font-bold text-gray-800 mb-2 flex items-center"><MousePointer className="w-4 h-4 mr-2 text-blue-500"/> 실시간 유입 분석</h4>
                    <p className="text-sm mb-2">누가, 언제, 어떤 검색어로 내 사이트에 들어왔는지 실시간으로 보여줍니다.</p>
                    <ul className="list-disc list-inside text-sm bg-gray-50 p-3 rounded">
                        <li><strong>IP 주소 확인:</strong> 같은 IP가 반복적으로 찍히는지 확인하세요.</li>
                        <li><strong>유입 유형:</strong> '광고 클릭'인지 '일반 접속'인지 구분해 줍니다.</li>
                    </ul>
                 </div>
                 <div className="flex-1">
                    <h4 className="font-bold text-gray-800 mb-2 flex items-center"><Shield className="w-4 h-4 mr-2 text-red-500"/> IP 차단 관리</h4>
                    <p className="text-sm mb-2">의심되는 IP를 발견했나요? 즉시 차단하세요.</p>
                    <ul className="list-disc list-inside text-sm bg-red-50 p-3 rounded text-red-800">
                        <li><strong>차단 효과:</strong> 등록된 IP에서는 내 광고가 아예 보이지 않습니다.</li>
                        <li><strong>클릭 원천 봉쇄:</strong> 광고비를 0원으로 아껴드립니다.</li>
                    </ul>
                 </div>
              </div>
            </div>
          </section>

           {/* 4. 기타 도구 */}
           <section id="ads" className="scroll-mt-4 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
              <Layers className="w-6 h-6 mr-2 text-purple-600" /> 기타 편의 기능
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h4 className="font-bold text-gray-800 mb-2 flex items-center"><Image className="w-4 h-4 mr-2"/> 광고 소재 관리</h4>
                    <p className="text-sm text-gray-600">
                        잘 팔리는 광고 문구가 따로 있다는 사실, 아시나요?<br/>
                        기존 소재를 복사(Clone)해서 문구만 살짝 바꿔 <strong>A/B 테스트</strong>를 쉽게 진행할 수 있습니다.
                    </p>
                </div>
                <div>
                     <h4 className="font-bold text-gray-800 mb-2 flex items-center"><TrendingUp className="w-4 h-4 mr-2"/> 키워드 자동 확장</h4>
                    <p className="text-sm text-gray-600">
                        각종 키워드 조합을 간편하게 추가하세요!<br/>
                        10만개의 키워드도 <strong>한번에 등록 가능!</strong> 그룹 내에 키워드 1,000개 이상 시 자동으로 그룹 생성!
                    </p>
                </div>
            </div>
          </section>

          <div className="text-center p-8 bg-gray-100 rounded-xl text-gray-500 text-sm">
            <p>© 2026 ID Company. All rights reserved.</p>
            <p className="mt-2">본 서비스는 네이버 검색광고 공식 API를 준수합니다.</p>
          </div>

        </div>
      </div>
    </div>
  );
};