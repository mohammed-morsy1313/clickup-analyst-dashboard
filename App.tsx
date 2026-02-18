import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClickUpService } from './services/clickupService';
import { analyzeTasks } from './services/aiService';
import { ClickUpTask, ClickUpTeam } from './types';
import { Dashboard } from './components/Dashboard';
import { TaskDetails } from './components/TaskDetails';
import { Settings, LogOut, LayoutDashboard, Database, Key, AlertCircle, RefreshCw, UserCheck, Share2, Copy, ShieldCheck, Moon, Sun, BarChart3, Filter, CheckCircle2, Zap, ChevronRight, Infinity as InfinityIcon } from 'lucide-react';

const STORAGE_KEY_TOKEN = 'clickup_pat';

// -- Optimized Task Organization Logic --
const processTasks = (fetchedTasks: ClickUpTask[], userId: number) => {
    // 1. Initialize Map
    const taskMap = new Map<string, ClickUpTask>();
    const tasks = fetchedTasks.map(t => ({ ...t, subtasks: [] })); 

    tasks.forEach(t => {
        taskMap.set(t.id, t);
    });

    const roots: ClickUpTask[] = [];

    // 2. Build Tree
    tasks.forEach(t => {
        if (t.parent && taskMap.has(t.parent)) {
            taskMap.get(t.parent)!.subtasks!.push(t);
        } else {
            roots.push(t);
        }
    });

    // 3. Define Relevance (Assigned OR Created OR Watcher)
    const isRelevant = (t: ClickUpTask) => {
      const uid = String(userId);
      return t.assignees.some(u => String(u.id) === uid) || 
             String(t.creator.id) === uid || 
             t.watchers.some(u => String(u.id) === uid);
    };

    // 4. Recursive Filter
    const hasRelevantContent = (t: ClickUpTask): boolean => {
        const amIRelevant = isRelevant(t);
        
        let childIsRelevant = false;
        if (t.subtasks && t.subtasks.length > 0) {
            childIsRelevant = t.subtasks.some(sub => hasRelevantContent(sub));
        }
        
        return amIRelevant || childIsRelevant;
    };

    const filteredRoots = roots.filter(root => hasRelevantContent(root));

    // 5. Sort by orderindex
    const sortTasks = (taskList: ClickUpTask[]) => {
      taskList.sort((a, b) => {
           const orderA = parseFloat(a.orderindex) || 0;
           const orderB = parseFloat(b.orderindex) || 0;
           return orderA - orderB;
      });
      taskList.forEach(t => {
          if (t.subtasks && t.subtasks.length > 0) sortTasks(t.subtasks);
      });
    };
    
    sortTasks(filteredRoots);

    return filteredRoots;
};

// Share Modal Component
const ShareModal = ({ onClose }: { onClose: () => void }) => {
    const [copied, setCopied] = useState(false);
    const url = window.location.href;

    const handleCopy = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative border border-gray-100 dark:border-slate-700">
                <div className="bg-indigo-600 p-6 text-white text-center">
                    <Share2 size={32} className="mx-auto mb-3 opacity-90" />
                    <h3 className="text-xl font-bold">Share Dashboard</h3>
                    <p className="text-indigo-100 text-sm mt-1">Securely share this tool with your team.</p>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Application Link</label>
                        <div className="flex gap-2">
                            <input 
                                readOnly 
                                value={url} 
                                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300 outline-none"
                            />
                            <button 
                                onClick={handleCopy}
                                className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-3 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium text-sm"
                            >
                                {copied ? <ShieldCheck size={16} /> : <Copy size={16} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg p-4">
                        <h4 className="flex items-center gap-2 text-amber-800 dark:text-amber-500 font-bold text-sm mb-2">
                            <ShieldCheck size={16} /> Security Notice
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                            Do <strong>not</strong> share your Personal Access Token. 
                            Send this link to your colleagues. They must log in with their own 
                            ClickUp API Token to view their own tasks.
                        </p>
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export const App: React.FC = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem(STORAGE_KEY_TOKEN) || '');
  const isAuthenticated = !!token;
  
  const [teams, setTeams] = useState<ClickUpTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  
  // Authenticated User Info
  const [currentUser, setCurrentUser] = useState<{ id: number, email: string, username: string, initials: string } | null>(null);
  
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [rawTaskCount, setRawTaskCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const [selectedTask, setSelectedTask] = useState<ClickUpTask | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const clickup = useMemo(() => new ClickUpService(token), [token]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    setToken(newToken);
    setError(null);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    setToken('');
    setTasks([]);
    setTeams([]);
    setSelectedTeamId('');
    setCurrentUser(null);
  };

  const fetchInitialData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [fetchedTeams, user] = await Promise.all([
        clickup.getTeams(),
        clickup.getUser()
      ]);
      
      setTeams(fetchedTeams);
      setCurrentUser({
          id: user.id,
          email: user.email,
          username: user.username,
          initials: user.initials || user.username.substring(0, 2).toUpperCase()
      });
      
      // Default to first available team
      if (fetchedTeams.length > 0) {
         setSelectedTeamId(fetchedTeams[0].id);
      }
      
      if (fetchedTeams.length === 0) {
        setError("No workspaces found for this user.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to connect to ClickUp. Check your API Token.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, clickup]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchInitialData();
    }
  }, [isAuthenticated, fetchInitialData]);

  const fetchTasks = useCallback(async () => {
    if (!selectedTeamId || !currentUser) return;
    setLoading(true);
    try {
        const userId = currentUser.id;
        
        const [assignedTasks, generalTasks] = await Promise.all([
            clickup.getTasks(selectedTeamId, [userId], 5), 
            clickup.getTasks(selectedTeamId, [], 5)              
        ]);

        const taskMap = new Map<string, ClickUpTask>();
        generalTasks.forEach(t => taskMap.set(t.id, t));
        assignedTasks.forEach(t => taskMap.set(t.id, t));
        
        const allFetchedTasks = Array.from(taskMap.values());
        setRawTaskCount(allFetchedTasks.length);
        
        const organizedTasks = processTasks(allFetchedTasks, userId);
        setTasks(organizedTasks);
        setLastUpdated(new Date());
        
    } catch (e: any) {
      console.error(e);
      setError("Failed to fetch tasks. Ensure you have permissions.");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, currentUser, clickup]);

  useEffect(() => {
    if (selectedTeamId && currentUser) {
      fetchTasks();
    }
  }, [selectedTeamId, currentUser, fetchTasks]);

  // Periodic Refresh
  useEffect(() => {
    const interval = setInterval(() => {
        if (selectedTeamId && currentUser) {
            fetchTasks(); 
        }
    }, 60000); 
    return () => clearInterval(interval);
  }, [selectedTeamId, currentUser, fetchTasks]);

  const handleAnalyze = async () => {
    if (tasks.length === 0 || !currentUser) return;
    setIsAnalyzing(true);
    const flatList: ClickUpTask[] = [];
    const traverse = (t: ClickUpTask) => {
        flatList.push(t);
        if (t.subtasks) t.subtasks.forEach(traverse);
    };
    tasks.forEach(traverse);

    const result = await analyzeTasks(flatList, currentUser.username);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-indigo-500/30 font-sans">
        {/* Header */}
        <header className="py-6 px-4 sm:px-8 flex justify-between items-center max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
                <Database className="text-indigo-500" /> DataAnalyst.ai
            </div>
            <button 
                onClick={() => document.getElementById('login-form')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium transition-all text-sm"
            >
                Sign In
            </button>
        </header>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-6 py-20 text-center flex flex-col items-center">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
                Your ClickUp Tasks, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">Visualized</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
                Get a comprehensive view of all your tasks with real-time insights, advanced filtering, and beautiful visualizations using Gemini AI.
            </p>

            {/* Login Form Section */}
            <div id="login-form" className="w-full max-w-md bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-8 rounded-2xl shadow-2xl transform transition-all hover:scale-[1.01]">
                 <form onSubmit={(e) => { e.preventDefault(); const t = (e.currentTarget.elements[0] as HTMLInputElement).value; if(t) handleLogin(t); }} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5 text-left">Personal Access Token</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-white placeholder-slate-500 transition-all" 
                                placeholder="pk_..." 
                                autoFocus 
                            />
                            <Key className="absolute left-3 top-3.5 text-slate-500" size={18} />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2">
                        Get Started <ChevronRight size={18} />
                    </button>
                    <p className="text-xs text-slate-500 mt-4">
                        Don't have a token? <a href="https://app.clickup.com/settings/apps" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline">Generate one in ClickUp settings</a>.
                    </p>
                 </form>
            </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { icon: BarChart3, title: "Interactive Charts", desc: "Visualize task distribution by status, priority, and category at a glance.", color: "text-blue-400" },
                    { icon: Filter, title: "Smart Filtering", desc: "Filter by status, priority, category, and search to find exactly what you need.", color: "text-purple-400" },
                    { icon: CheckCircle2, title: "Task Categories", desc: "See tasks assigned to you, created by you, or that you're following in one place.", color: "text-green-400" },
                    { icon: Zap, title: "Real-Time Sync", desc: "Your dashboard stays up-to-date with your latest ClickUp tasks and changes.", color: "text-amber-400" }
                ].map((feature, idx) => (
                    <div key={idx} className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl hover:bg-slate-800/60 transition-colors">
                        <feature.icon className={`w-8 h-8 mb-4 ${feature.color}`} />
                        <h3 className="text-white font-bold text-lg mb-2">{feature.title}</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                    </div>
                ))}
            </div>
        </div>

        {/* Stats / Footer */}
        <div className="max-w-4xl mx-auto px-6 py-20 flex flex-col md:flex-row justify-between items-center text-center gap-10 border-t border-slate-800/50 mt-10">
            <div>
                <div className="text-4xl font-bold text-white mb-1">3</div>
                <div className="text-slate-500 text-sm uppercase tracking-wider font-medium">Task Categories</div>
            </div>
            <div>
                 <div className="text-4xl font-bold text-white mb-1 flex items-center justify-center gap-2">
                    <InfinityIcon size={36} className="text-indigo-500" />
                 </div>
                <div className="text-slate-500 text-sm uppercase tracking-wider font-medium">Filterable Tasks</div>
            </div>
            <div>
                <div className="text-4xl font-bold text-white mb-1 text-green-400">Live</div>
                <div className="text-slate-500 text-sm uppercase tracking-wider font-medium">Real-Time Updates</div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-8 z-10 transition-colors duration-200">
            <div className="flex items-center gap-4">
                {/* Logo moved to Header */}
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-600 rounded-lg shadow-sm"><Database className="text-white" size={20} /></div>
                    <span className="font-bold text-gray-800 dark:text-white tracking-tight text-lg hidden sm:inline">DataAnalyst<span className="text-indigo-600">.ai</span></span>
                </div>
                
                <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block"></div>

                <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">Araby Brand Workload</h2>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                         <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                         <span>Live with ClickUp</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
                 {rawTaskCount > 0 && tasks.length === 0 && (
                     <div className="hidden md:flex text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded border border-amber-200 dark:border-amber-500/20 items-center gap-1">
                         <AlertCircle size={12}/> Hidden by Filters
                     </div>
                 )}
                 
                 <div className="text-xs text-gray-400 hidden lg:block">Updated: {lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                 
                 <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-2 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors border border-gray-200 dark:border-slate-700"
                    title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                 >
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                 </button>

                 <button 
                    onClick={() => setShowShareModal(true)}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-full text-xs font-semibold transition-colors border border-indigo-100 dark:border-indigo-500/20"
                 >
                    <Share2 size={14} /> Share
                 </button>

                 <button onClick={fetchTasks} disabled={loading} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Refresh">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                 </button>
                 
                 <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1"></div>

                 {currentUser && (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs" title={currentUser.username}>
                        {currentUser.initials}
                    </div>
                 )}

                 <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors" title="Disconnect">
                    <LogOut size={18} />
                 </button>
            </div>
        </header>

        <div className="flex-1 overflow-auto p-8 relative">
            {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2"><AlertCircle size={20} />{error}</div>}
            
            <Dashboard 
                tasks={tasks} 
                loading={loading} 
                onTaskClick={setSelectedTask} 
                onAnalyze={handleAnalyze} 
                isAnalyzing={isAnalyzing} 
                analysisResult={analysisResult} 
                currentUserId={currentUser ? currentUser.id : null}
                darkMode={darkMode}
            />
        </div>
      </main>
        
      {selectedTask && currentUser && (
        <TaskDetails 
          task={selectedTask} 
          currentUserId={currentUser.id} 
          onClose={() => setSelectedTask(null)} 
          clickupService={clickup} 
          onNavigate={(t) => setSelectedTask(t)}
        />
      )}

      {showShareModal && <ShareModal onClose={() => setShowShareModal(false)} />}
    </div>
  );
};