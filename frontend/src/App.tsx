import { Outlet } from 'react-router-dom';
import { IconVideo } from './components/ui/Icons';

function App() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-indigo-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-purple-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50rem] h-[50rem] bg-cyan-600/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#020617]/70 backdrop-blur-md supports-[backdrop-filter]:bg-[#020617]/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg blur opacity-40 group-hover:opacity-75 transition duration-200"></div>
              <div className="relative p-2 bg-[#0f172a] rounded-lg border border-white/10">
                <IconVideo className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                视频生成系统
              </h1>
              <p className="text-xs text-indigo-300/60 font-medium tracking-wide">AI 驱动的短视频创作工具</p>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
