import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface Skill {
  id: string;
  owner: string;
  repo: string;
  name: string;
  description: string;
  tags: string[];
  stars: number;
  installs: number;
  version?: string;
  content?: string;
  updated_at: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Skill | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSkills = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const res = await fetch(`${API_URL}/api/skills?${params}`);
      const data = await res.json();
      setSkills(data.skills || []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSkills(search);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [search, fetchSkills]);

  async function openSkill(skill: Skill) {
    setSelected(skill);
    
    if (!skill.content) {
      try {
        const res = await fetch(`${API_URL}/api/skills/${skill.owner}/${skill.repo}/${skill.name}`);
        if (res.ok) {
          const data = await res.json();
          setSelected({ ...skill, content: data.content || skill.description });
        } else {
          setSelected({ ...skill, content: skill.description });
        }
      } catch {
        setSelected({ ...skill, content: skill.description });
      }
    }
  }

  function copyInstallCmd() {
    if (!selected) return;
    const cmd = `npx skit add ${selected.owner}/${selected.repo}/${selected.name}`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalStars = skills.reduce((a, s) => a + s.stars, 0);

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <header>
        <div className="container">
          <div className="logo">
            <svg className="logo-icon" width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bolt-main" x1="20%" y1="0%" x2="80%" y2="100%">
                  <stop offset="0%" stopColor="#00F5FF"/>
                  <stop offset="100%" stopColor="#FF006E"/>
                </linearGradient>
                <linearGradient id="bolt-highlight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5"/>
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path d="M38 2L10 34H26L18 62L54 26H36L38 2Z" fill="url(#bolt-main)" opacity="0.3" filter="url(#glow)"/>
              <path d="M38 2L10 34H26L18 62L54 26H36L38 2Z" fill="url(#bolt-main)"/>
              <path d="M38 2L22 22H32L26 38L44 26H36L38 2Z" fill="url(#bolt-highlight)"/>
              <path d="M36 8L34 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
            </svg>
            <span>skit</span>
          </div>
          
          <div className="search-wrapper">
            <div className="search-box">
              <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search agent skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

        </div>
      </header>

      <main>
        <div className="container">
          <div className="hero">
            <h1>
              Agent <span className="highlight">Skills</span> Kit
            </h1>
            <p>
              Browse, search and install skills for AI coding agents. 
              Works with Cursor, Claude Code, Codex and more.
            </p>
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{skills.length}</div>
                <div className="stat-label">Skills</div>
              </div>
              <div className="stat">
                <div className="stat-value">{totalStars.toLocaleString()}</div>
                <div className="stat-label">Stars</div>
              </div>
            </div>
          </div>

          <div className="source-indicator">
            <span className="dot" />
            <span>Connected to Registry</span>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : skills.length === 0 ? (
            <div className="empty-state">
              <p>No skills found. Try a different search term.</p>
            </div>
          ) : (
            <div className="skills-grid">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="skill-card"
                  onClick={() => openSkill(skill)}
                >
                  <div className="skill-header">
                    <div>
                      <div className="skill-name">{skill.name}</div>
                      <div className="skill-repo">{skill.owner}/{skill.repo}</div>
                    </div>
                    {skill.version && (
                      <span className="skill-version">v{skill.version}</span>
                    )}
                  </div>
                  <div className="skill-description">
                    {skill.description || 'No description available'}
                  </div>
                  <div className="skill-footer">
                    <div className="skill-stat stars">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      {skill.stars.toLocaleString()}
                    </div>
                    {skill.installs > 0 && (
                      <div className="skill-stat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {skill.installs}
                      </div>
                    )}
                    {skill.tags.length > 0 && (
                      <div className="skill-tags">
                        {skill.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="install-cmd">
                <code>npx skit add {selected.owner}/{selected.repo}/{selected.name}</code>
                <button className="copy-btn" onClick={copyInstallCmd}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="skill-content">
                <ReactMarkdown>{selected.content || selected.description}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
