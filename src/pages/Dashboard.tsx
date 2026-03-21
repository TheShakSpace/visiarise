import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore, Project } from '../store/useAppStore';
import { motion } from 'motion/react';
import {
  Plus,
  Search,
  Grid,
  List,
  MoreVertical,
  ExternalLink,
  Clock,
  Zap,
  CreditCard,
  TrendingUp,
  LogOut,
  Settings,
  ChevronRight,
  Box,
  User,
  Check,
} from 'lucide-react';
import { ArdyaWordmark } from '../components/ArdyaWordmark';

export default function Dashboard() {
  const { user, projects, addProject, logout, updateUser } = useAppStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '');
  const [profileSaved, setProfileSaved] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setProfileName(user?.name ?? '');
    setProfileEmail(user?.email ?? '');
  }, [user?.name, user?.email]);

  const saveProfile = () => {
    const name = profileName.trim() || 'Creator';
    const email = profileEmail.trim() || user?.email || '';
    updateUser({ name, email });
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleCreateProject = () => {
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Untitled Project',
      description: 'A new AR experience with ARdya.',
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
    addProject(newProject);
    navigate(`/project/${newProject.id}`);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex bg-[#050505]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col p-6 hidden md:flex">
        <Link to="/" className="flex items-center gap-3 mb-10 group">
          <img src="/VisiARise_LOGO.png" alt="" className="h-10 w-auto opacity-90" />
          <div className="flex flex-col">
            <ArdyaWordmark className="text-base" />
            <span className="text-[9px] text-white/35 uppercase tracking-widest">Workspace</span>
          </div>
        </Link>

        <nav className="flex-1 space-y-2">
          <Link to="/dashboard" className="flex items-center gap-3 px-4 py-3 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-sm">
            <Grid className="w-4 h-4" />
            Projects
          </Link>
          <Link to="/marketplace" className="flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white hover:bg-white/5 rounded-xl font-medium text-sm transition-all">
            <Zap className="w-4 h-4" />
            Marketplace
          </Link>
          <a
            href="#workspace-profile"
            className="flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white hover:bg-white/5 rounded-xl font-medium text-sm transition-all"
          >
            <Settings className="w-4 h-4" />
            Profile &amp; settings
          </a>
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5 space-y-4" id="workspace-profile">
          <div className="px-2 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 flex items-center gap-2">
              <User className="w-3 h-3" />
              Profile
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center font-bold text-sm shrink-0">
                {(user?.name?.charAt(0) ?? '?').toUpperCase()}
              </div>
              <span className="text-[10px] text-white/30">Shown across workspace</span>
            </div>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Display name"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-brand-primary/40"
            />
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-brand-primary/40"
            />
            <button
              type="button"
              onClick={saveProfile}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary/15 text-brand-primary text-xs font-bold hover:bg-brand-primary/25 transition-colors border border-brand-primary/20"
            >
              {profileSaved ? <Check className="w-4 h-4" /> : null}
              {profileSaved ? 'Saved' : 'Save profile'}
            </button>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 rounded-xl font-medium text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        {/* Mobile profile strip */}
        <div className="md:hidden mb-8 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Your profile</p>
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center font-bold shrink-0">
              {(user?.name?.charAt(0) ?? '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-sm"
                placeholder="Name"
              />
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-sm"
                placeholder="Email"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={saveProfile}
            className="w-full py-2.5 rounded-xl bg-brand-primary/20 text-brand-primary text-xs font-bold border border-brand-primary/25"
          >
            {profileSaved ? 'Saved ✓' : 'Save profile'}
          </button>
        </div>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Projects
              {user?.name ? (
                <span className="text-white/35 font-normal text-xl block sm:inline sm:ml-2">
                  · {user.name}
                </span>
              ) : null}
            </h1>
            <p className="text-white/40">Manage and create your AR experiences.</p>
          </div>
          <button 
            onClick={handleCreateProject}
            className="bg-brand-primary text-black px-6 py-3 rounded-full font-bold hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/20"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            { icon: Box, label: "Total Models", value: projects.length, color: "text-brand-primary" },
            { icon: TrendingUp, label: "Views", value: "1.2k", color: "text-purple-500" },
            { icon: CreditCard, label: "Credits", value: "850", color: "text-blue-500" },
            { icon: Zap, label: "Usage", value: "12%", color: "text-orange-500" }
          ].map((stat, i) => (
            <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Monthly</span>
              </div>
              <p className="text-2xl font-bold mb-1">{stat.value}</p>
              <p className="text-xs text-white/40 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="relative w-full sm:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-brand-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-brand-primary/50 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 p-1 bg-white/5 border border-white/10 rounded-xl">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Projects Grid/List */}
        {filteredProjects.length > 0 ? (
          <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-4"}>
            {filteredProjects.map((project) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={project.id}
                className={viewMode === 'grid' 
                  ? "group relative rounded-3xl bg-white/5 border border-white/10 overflow-hidden hover:border-brand-primary/30 transition-all"
                  : "group flex items-center gap-6 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-primary/30 transition-all"
                }
              >
                {/* Thumbnail */}
                <div className={viewMode === 'grid' 
                  ? "aspect-video bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 relative overflow-hidden"
                  : "w-24 h-16 rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 relative overflow-hidden shrink-0"
                }>
                  {project.thumbnailUrl ? (
                    <img src={project.thumbnailUrl} alt={project.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Box className="w-8 h-8 text-white/10" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-widest">
                    {project.status}
                  </div>
                </div>

                {/* Info */}
                <div className={viewMode === 'grid' ? "p-6" : "flex-1 min-w-0"}>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-bold truncate group-hover:text-brand-primary transition-colors">{project.name}</h3>
                    <button className="text-white/20 hover:text-white transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-white/40 line-clamp-2 mb-4">{project.description}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-white/20">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Link 
                      to={`/project/${project.id}`}
                      className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <Box className="w-10 h-10 text-white/10" />
            </div>
            <h3 className="text-xl font-bold mb-2">No projects found</h3>
            <p className="text-white/40 mb-8 max-w-xs">Start your journey by creating your first AR experience.</p>
            <button 
              onClick={handleCreateProject}
              className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-white/90 transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
