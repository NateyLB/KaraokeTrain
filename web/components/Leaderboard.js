"use client";

import { Trophy, Medal, Star } from 'lucide-react';

export default function Leaderboard({ scores }) {
  // In a real app, this would fetch from Supabase.
  const mockScores = scores || [
    { name: 'Nate', score: 14500 },
    { name: 'Alex', score: 12200 },
    { name: 'Sam', score: 9800 },
  ];

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Trophy color="var(--primary-accent)" />
        <h2 className="heading-2" style={{ fontSize: '1.5rem' }}>Leaderboard</h2>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {mockScores.map((s, i) => (
          <div key={i} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '1rem',
            background: i === 0 ? 'rgba(139, 92, 246, 0.1)' : 'var(--glass-bg)',
            borderRadius: 'var(--border-radius-sm)',
            border: i === 0 ? '1px solid var(--primary-accent)' : '1px solid var(--glass-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                background: 'var(--bg-dark)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontWeight: 'bold',
                color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : '#b45309'
              }}>
                {i + 1}
              </div>
              <span className="body-text" style={{ fontWeight: i === 0 ? 'bold' : 'normal', color: 'var(--text-main)' }}>{s.name}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="heading-2 text-gradient" style={{ fontSize: '1.25rem' }}>{s.score}</span>
              {i === 0 && <Star size={16} color="#fbbf24" fill="#fbbf24" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
