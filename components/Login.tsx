import React, { useState, useEffect } from 'react';
import { Lock, User, LogIn, Loader2 } from 'lucide-react'; // 아이콘 유지/추가
import { naverService } from '../services/naverService';
import { ShieldCheck } from 'lucide-react';

interface Props {
  onLoginSuccess: () => void;
  onGoRegister: () => void;
}

export const Login: React.FC<Props> = ({ onLoginSuccess, onGoRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // [기존 기능 복구] 저장된 아이디 불러오기
  useEffect(() => {
    const savedId = localStorage.getItem('saved_username');
    if (savedId) {
      setUsername(savedId);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. 아이디 저장 처리 (Remember Me)
      if (rememberMe) {
        localStorage.setItem('saved_username', username);
      } else {
        localStorage.removeItem('saved_username');
      }

      // 2. 서버에 로그인 요청
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      await naverService.login(formData);
      onLoginSuccess(); // 성공 시 메인 화면으로 전환

    } catch (error) {
      alert('로그인 실패: 아이디 또는 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-gray-200">
        
        {/* [디자인 유지] 상단 로고 및 타이틀 */}
        <div className="text-center mb-8">
          <div className="bg-naver-green w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">NAVER AD PRO 로그인</h1>
          <p className="text-gray-500 mt-2 text-sm">아이디와 비밀번호로 접속하세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 아이디 입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                required 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naver-green focus:border-transparent outline-none transition-all"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
          </div>

          {/* 비밀번호 입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input 
                type="password" 
                required 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naver-green focus:border-transparent outline-none transition-all"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* 아이디 저장 체크박스 */}
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="remember" 
              checked={rememberMe} 
              onChange={e => setRememberMe(e.target.checked)}
              className="w-4 h-4 accent-naver-green cursor-pointer"
            />
            <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer select-none">아이디 저장</label>
          </div>

          {/* 로그인 버튼 */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-naver-green text-white font-bold py-3 rounded-lg hover:bg-naver-dark transition-all shadow-md flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5"/> : '접속하기'}
          </button>
        </form>

        {/* 회원가입 버튼 연결 */}
        <div className="mt-6 text-center border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">아직 계정이 없으신가요?</p>
          <button onClick={onGoRegister} className="text-indigo-600 font-bold hover:underline text-sm">
            회원가입하고 시작하기
          </button>
        </div>
        
        {/* ▼▼▼ [추가] 하단 사업자 정보 및 푸터 ▼▼▼ */}
        <div className="mt-8 text-center text-xs text-gray-400 space-y-2 max-w-2xl">
        <div className="flex justify-center space-x-4 mb-4">
            <button className="hover:text-gray-600 underline">이용약관</button>
            <span className="text-gray-300">|</span>
            <button className="hover:text-gray-800 font-bold underline">개인정보처리방침</button>
        </div>
        <p>
          상호명: 아이디컴퍼니 | 대표: 최지용 | 사업자등록번호: 619-12-16444<br/>
          주소: (사업자등록증 상 주소 기재 권장) | 전화번호: 010-8839-8387<br/>
          계좌번호: 농협 301-8839-8387-61 최지용
        </p>
        <p className="flex items-center justify-center mt-2">
          <ShieldCheck className="w-3 h-3 mr-1" />
          본 서비스는 네이버 검색광고 API를 준수하며, 사용자의 개인정보를 암호화하여 안전하게 보호합니다.
        </p>
        <p className="mt-4">© 2026 ID Company. All rights reserved.</p>
        </div>

      </div>
    </div>
  );
};