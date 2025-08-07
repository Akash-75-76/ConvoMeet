import './App.css';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Authentication from './pages/Authentication';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Authentication />} />
      {/* Add other routes here as needed */}
    </Routes>
  );
}

export default App;
