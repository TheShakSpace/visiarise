import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Briefcase, Plus, MapPin, Clock } from 'lucide-react';
import Navbar from '../components/Navbar';
import FreelancerCard from '../components/FreelancerCard';
import { useAppStore } from '../store/useAppStore';
import { Link } from 'react-router-dom';

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  budget: string;
  posted: string;
};

const OPEN_JOBS: Job[] = [
  {
    id: '1',
    title: 'WebAR product viewer — shoe launch',
    company: 'Independent brand',
    location: 'Remote',
    type: 'Contract',
    budget: '$2.5k – $4k',
    posted: '3 days ago',
  },
  {
    id: '2',
    title: 'Optimize GLB for mobile AR (under 8MB)',
    company: 'Retail pilot',
    location: 'Remote',
    type: 'Fixed',
    budget: '$800 – $1.2k',
    posted: '1 week ago',
  },
  {
    id: '3',
    title: 'Blender hard-surface + AR export',
    company: 'Hardware startup',
    location: 'EU / Remote',
    type: 'Part-time',
    budget: '$45–65/hr',
    posted: '2 weeks ago',
  },
];

export default function FreelancersHub() {
  const { freelancers } = useAppStore();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return freelancers.filter(
      (f) =>
        f.name.toLowerCase().includes(s) ||
        f.skills.some((k) => k.toLowerCase().includes(s))
    );
  }, [freelancers, q]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/20">
      <Navbar />
      <section className="pt-36 pb-16 px-6 border-b border-white/10">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/50 mb-6">
            VisiARise · Talent
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight mb-6">
            Freelancers & jobs
          </h1>
          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Prefer a custom build over a marketplace asset? Post a brief or hire spatial designers
            for modeling, AR optimization, and WebAR delivery.
          </p>
          <button
            type="button"
            className="btn-neon-purple inline-flex items-center gap-2 px-8 py-4 text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Post a job
          </button>
          <p className="text-[10px] text-white/30 mt-4 uppercase tracking-widest">
            Job board is launching — your post will be reviewed manually for now.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Briefcase className="w-5 h-5 text-brand-primary" />
          <h2 className="text-2xl font-display font-bold">Open roles</h2>
        </div>
        <div className="space-y-4 mb-24">
          {OPEN_JOBS.map((job) => (
            <motion.div
              key={job.id}
              layout
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div>
                <h3 className="text-lg font-bold mb-1">{job.title}</h3>
                <p className="text-sm text-white/45">{job.company}</p>
                <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-white/40 uppercase tracking-widest">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {job.location}
                  </span>
                  <span>{job.type}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {job.posted}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-brand-primary font-bold">{job.budget}</div>
                <button
                  type="button"
                  className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10">
          <h2 className="text-2xl font-display font-bold">Featured freelancers</h2>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:border-brand-primary/40"
            />
          </div>
          <button
            type="button"
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40"
            aria-label="Filter"
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {filtered.map((f) => (
            <FreelancerCard key={f.id} freelancer={f} />
          ))}
        </div>
        <p className="text-center text-white/35 text-sm mt-16">
          Want assets instead?{' '}
          <Link to="/marketplace" className="text-brand-primary hover:underline">
            VisiARise Marketplace
          </Link>
        </p>
      </section>
    </div>
  );
}
