import './App.css';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Authentication from './pages/Authentication';
import VideoMeetComponent from './pages/VedioMeet';
import HomeComponent from './pages/Home';
function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Authentication />} />
      <Route path='/:url' element={<VideoMeetComponent />} />
      <Route path='/home'  element={<HomeComponent />} />
      
      {/* Add other routes here as needed */}
    </Routes>
  );
}

export default App;
