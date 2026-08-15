import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Shell from './components/Shell.jsx';
import Login from './screens/Login.jsx';
import WaitingRoom from './screens/WaitingRoom.jsx';
import Visit from './screens/Visit.jsx';
import VisitSummary from './screens/VisitSummary.jsx';
import FollowUps from './screens/FollowUps.jsx';
import Lessons from './screens/Lessons.jsx';
import Progress from './screens/Progress.jsx';

const TITLES = {
  waiting: 'The Waiting Room',
  followups: 'Follow-Ups',
  lessons: 'Lessons',
  progress: 'Your Progress',
};

export default function App() {
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('waiting');
  const [visitSession, setVisitSession] = useState(null); // { visit, patient }
  const [summaryVisitId, setSummaryVisitId] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((d) => setProfile(d.profile))
      .catch(() => setProfile(null))
      .finally(() => setBooting(false));
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setProfile(null);
    setVisitSession(null);
    setSummaryVisitId(null);
    setView('waiting');
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-muted">
        <p>Opening the office…</p>
      </div>
    );
  }

  if (!profile) return <Login onSignedIn={setProfile} />;

  // A visit takes over the whole screen — no tabs to wander off into mid-interview.
  if (visitSession) {
    return (
      <Visit
        session={visitSession}
        onFinished={(visitId) => {
          setVisitSession(null);
          setSummaryVisitId(visitId);
        }}
        onLeave={() => setVisitSession(null)}
        onSignOut={signOut}
      />
    );
  }

  if (summaryVisitId) {
    return (
      <VisitSummary
        visitId={summaryVisitId}
        onDone={() => {
          setSummaryVisitId(null);
          setView('waiting');
        }}
        onSignOut={signOut}
      />
    );
  }

  const startVisit = (session) => setVisitSession(session);

  return (
    <Shell view={view} onNavigate={setView} title={TITLES[view]} onSignOut={signOut}>
      {view === 'waiting' && <WaitingRoom onStart={startVisit} />}
      {view === 'followups' && <FollowUps onStart={startVisit} onOpenVisit={setSummaryVisitId} />}
      {view === 'lessons' && <Lessons />}
      {view === 'progress' && <Progress onOpenVisit={setSummaryVisitId} />}
    </Shell>
  );
}
