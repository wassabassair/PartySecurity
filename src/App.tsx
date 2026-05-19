import { Routes, Route, Navigate } from 'react-router-dom';
import Scan from './pages/Scan';
import Admin from './pages/Admin';
import { BouncerGate } from './components/BouncerGate';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BouncerGate><Scan /></BouncerGate>} />
      <Route path="/scan" element={<BouncerGate><Scan /></BouncerGate>} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
