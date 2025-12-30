import React, { useState, useEffect } from 'react';
import { Lock, Key, User, Save } from 'lucide-react';

interface LoginProps {
    onLogin: (apiKey: string, secretKey: string, customerId: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [apiKey, setApiKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    useEffect(() => {
        const savedApi = localStorage.getItem('naver_api_key');
        const savedSecret = localStorage.getItem('naver_secret_key');
        const savedCustomer = localStorage.getItem('naver_customer_id');
        if (savedApi && savedSecret && savedCustomer) {
            setApiKey(savedApi);
            setSecretKey(savedSecret);
            setCustomerId(savedCustomer);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (rememberMe) {
            localStorage.setItem('naver_api_key', apiKey);
            localStorage.setItem('naver_secret_key', secretKey);
            localStorage.setItem('naver_customer_id', customerId);
        } else {
            localStorage.removeItem('naver_api_key');
            localStorage.removeItem('naver_secret_key');
            localStorage.removeItem('naver_customer_id');
        }
        onLogin(apiKey, secretKey, customerId);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-gray-200">
                <div className="text-center mb-8">
                    <div className="bg-naver-green w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-white w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">네이버 검색광고 로그인</h1>
                    <p className="text-gray-500 mt-2 text-sm">API Key를 사용하여 안전하게 접속하세요.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Access License (API Key)</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input 
                                type="text" 
                                required 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naver-green focus:border-transparent outline-none"
                                placeholder="입력하세요"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input 
                                type="password" 
                                required 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naver-green focus:border-transparent outline-none"
                                placeholder="입력하세요"
                                value={secretKey}
                                onChange={e => setSecretKey(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input 
                                type="text" 
                                required 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naver-green focus:border-transparent outline-none"
                                placeholder="예: 123456"
                                value={customerId}
                                onChange={e => setCustomerId(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="remember" 
                            checked={rememberMe} 
                            onChange={e => setRememberMe(e.target.checked)}
                            className="w-4 h-4 accent-naver-green"
                        />
                        <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">로그인 정보 저장 (자동 로그인)</label>
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-naver-green text-white font-bold py-3 rounded-lg hover:bg-naver-dark transition-colors shadow-md"
                    >
                        접속하기
                    </button>
                </form>
            </div>
        </div>
    );
};