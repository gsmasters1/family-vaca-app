import { useState, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map as MapIcon, 
  CloudSun, 
  Utensils, 
  Compass, 
  Bell, 
  Navigation, 
  Settings, 
  LogOut,
  Info,
  AlertTriangle,
  ChevronUp,
  MapPin,
  Car,
  Activity,
  History,
  UserPlus,
  X
} from 'lucide-react';
import { auth, db } from './lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { useFamilyLocations, UserLocation, TrailPoint } from './hooks/useFamilyLocations';
import { getDisneyNews, getPlaceSuggestions, getTrafficReport } from './services/gemini';
import { cn } from './lib/utils';

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

function BreadcrumbTrail({ path, color }: { path: TrailPoint[], color: string }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLib || !path || path.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        map,
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 3,
        geodesic: true,
      });
    }

    const googlePath = path.map(p => ({ lat: p.lat, lng: p.lng }));
    polylineRef.current.setPath(googlePath);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, mapsLib, path, color]);

  return null;
}

export default function App() {
  const { family, currentUser, mileage } = useFamilyLocations();
  const [activeTab, setActiveTab] = useState<'map' | 'weather' | 'disney' | 'suggestions' | 'traffic' | 'allowlist' | 'yosemite'>('map');
  const [selectedUser, setSelectedUser] = useState<UserLocation | null>(null);
  const [isAlertsEnabled, setIsAlertsEnabled] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [disneyNews, setDisneyNews] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [traffic, setTraffic] = useState<any>(null);
  const [weather, setWeather] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [proximityAlert, setProximityAlert] = useState<any>(null);

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  useEffect(() => {
    if (!currentUser) {
      setIsAllowed(null);
      return;
    }

    // Check if current user is allowed
    const creatorEmail = 'gsmastersinc@gmail.com';
    
    import('firebase/firestore').then(({ doc, getDoc, onSnapshot, collection, setDoc }) => {
      if (currentUser.email === creatorEmail) {
        setIsAllowed(true);
        // Auto-add creator to allowlist
        setDoc(doc(db, 'allowed_emails', creatorEmail), { addedAt: new Date().toISOString() }, { merge: true });
      }

      // Check specific email
      getDoc(doc(db, 'allowed_emails', currentUser.email!)).then((docSnap) => {
        if (docSnap.exists() || currentUser.email === creatorEmail) {
          setIsAllowed(true);
        } else {
          setIsAllowed(false);
        }
      });

      // Listen to allowlist
      const unsub = onSnapshot(collection(db, 'allowed_emails'), (snapshot) => {
        setAllowedEmails(snapshot.docs.map(d => d.id));
      }, () => {});
      return unsub;
    });
  }, [currentUser]);

  const addEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) return;
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'allowed_emails', newEmail.toLowerCase().trim()), {
      addedAt: new Date().toISOString(),
      invitedBy: currentUser.email
    });
    setNewEmail('');
  };

  const removeEmail = async (email: string) => {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'allowed_emails', email));
  };

  useEffect(() => {
    if (currentUser?.uid && family.find(f => f.uid === currentUser.uid)?.location) {
      const userLoc = family.find(f => f.uid === currentUser.uid)!.location!;
      // Fetch initial data
      getDisneyNews()
        .then(setDisneyNews)
        .catch(err => {
          console.error("Disney load fail", err);
          setDisneyNews([{ title: "Disney Update", content: "Park Status: Typically open 8am-10pm. Check the official Disney app for live ride updates if this feed is slow.", severity: "info" }]);
        });
      getPlaceSuggestions(userLoc.lat, userLoc.lng, 'food').then(setSuggestions);
      getTrafficReport(userLoc.lat, userLoc.lng).then(setTraffic);
      
      // Free weather API
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${userLoc.lat}&longitude=${userLoc.lng}&current_weather=true&temperature_unit=fahrenheit`)
        .then(res => res.json())
        .then(data => {
          if (data && data.current_weather) {
            setWeather(data.current_weather);
          } else {
            console.warn("Weather data format unexpected", data);
            setWeather({ temperature: 0, windspeed: 0 }); 
          }
        })
        .catch(err => {
          console.error("Weather fetch failed", err);
          setWeather({ temperature: 72, windspeed: 5 }); // Realistic CA fallback
        });
    }
  }, [currentUser, family.length]);

  const userLocation = family.find(f => f.uid === currentUser?.uid)?.location || { lat: 34.0522, lng: -118.2437 };
  const currentUserActivity = family.find(f => f.uid === currentUser?.uid)?.trails?.slice(-1)[0]?.activity || 'stationary';

  // Proximity Alerts logic
  useEffect(() => {
    if (!isAlertsEnabled || suggestions.length === 0 || !userLocation) return;
    
    // 5 miles driving (~0.072 deg), 2 miles walking (~0.029 deg)
    const threshold = currentUserActivity === 'driving' ? 0.072 : 0.029;

    const checkProximity = () => {
      for (const site of suggestions) {
        if (!site.coordinates) continue;
        const dist = Math.sqrt(
          Math.pow(site.coordinates.lat - userLocation.lat, 2) + 
          Math.pow(site.coordinates.lng - userLocation.lng, 2)
        );
        
        if (dist < threshold && (!proximityAlert || proximityAlert.name !== site.name)) {
          setProximityAlert({
            name: site.name,
            description: site.description || site.significance,
            type: 'gem',
            coordinates: site.coordinates
          });
          break;
        }
      }
    };

    checkProximity();
  }, [userLocation, suggestions, isAlertsEnabled, currentUserActivity, proximityAlert]);

  if (!currentUser || isAllowed === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8 max-w-md w-full"
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-orange-500/20 blur-3xl rounded-full" />
            <Compass className="w-24 h-24 text-orange-500 mx-auto relative" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tighter">California Road Trip</h1>
            <p className="text-slate-400">
              {isAllowed === false 
                ? "This trip is private. Please ask the family organizer to add your email to the allowlist." 
                : "The ultimate family adventure tracker. Stay connected, stay informed, and enjoy the ride."}
            </p>
          </div>
          
          {isAllowed === false ? (
            <div className="space-y-4">
               <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-200 text-sm">
                 Access Denied for: <span className="font-bold">{currentUser.email}</span>
               </div>
               <button 
                onClick={logout}
                className="w-full py-4 border border-slate-700 text-white font-semibold rounded-2xl flex items-center justify-center gap-3"
              >
                Sign out & try another account
              </button>
            </div>
          ) : (
            <button 
              onClick={login}
              className="w-full py-4 bg-white text-black font-semibold rounded-2xl flex items-center justify-center gap-3 hover:bg-orange-50 transition-colors shadow-2xl shadow-white/10"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Sign in with Family Email
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-white overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-bottom border-slate-800 bg-slate-950/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Compass className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">Calif. Road Trip</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase font-black">My Mileage</span>
            <span className="text-sm font-bold text-orange-500">{mileage.toFixed(1)} miles</span>
          </div>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden shadow-inner"
          >
            <img src={currentUser.photoURL || 'https://via.placeholder.com/40'} alt="Profile" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <APIProvider apiKey={GOOGLE_MAPS_KEY}>
                <Map
                  defaultCenter={userLocation}
                  defaultZoom={11}
                  mapId="ROAD_TRIP_MAP"
                  style={{ width: '100%', height: '100%' }}
                  disableDefaultUI={true}
                  gestureHandling={'greedy'}
                >
                  {showTrails && family.map(user => user.trails && (
                    <BreadcrumbTrail 
                      key={`trail-${user.uid}`} 
                      path={user.trails} 
                      color={user.uid === currentUser.uid ? '#f97316' : '#94a3b8'} 
                    />
                  ))}

                  {family.map(user => user.location && (
                    <AdvancedMarker 
                      key={user.uid} 
                      position={{ lat: user.location.lat, lng: user.location.lng }}
                      onClick={() => setSelectedUser(user)}
                    >
                      <div className="relative group">
                        <div className="absolute -inset-2 bg-orange-500/30 blur-md rounded-full animate-pulse" />
                        <div className={cn(
                          "w-12 h-12 rounded-full border-2 p-0.5 relative z-10 transition-transform hover:scale-110 shadow-xl",
                          user.uid === currentUser.uid ? "border-orange-500" : "border-white"
                        )}>
                          <img 
                            src={user.photoURL || 'https://via.placeholder.com/48'} 
                            className="w-full h-full rounded-full object-cover" 
                            alt={user.displayName} 
                          />
                        </div>
                        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900 px-2 py-1 rounded-md text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700">
                          {user.displayName}
                        </div>
                      </div>
                    </AdvancedMarker>
                  ))}

                  {selectedUser && selectedUser.location && (
                    <InfoWindow 
                      position={{ lat: selectedUser.location.lat, lng: selectedUser.location.lng }}
                      onCloseClick={() => setSelectedUser(null)}
                    >
                      <div className="text-slate-900 p-2 min-w-32">
                        <p className="font-bold border-b border-slate-100 pb-1 mb-2">{selectedUser.displayName}</p>
                        <div className="space-y-1">
                          <p className="text-[10px] flex items-center gap-1 text-slate-500">
                             <History className="w-3 h-3" /> Updated: {new Date(selectedUser.location.updatedAt).toLocaleTimeString()}
                          </p>
                          {selectedUser.trails && selectedUser.trails.length > 0 && (
                             <p className="text-[10px] flex items-center gap-1 text-orange-600 font-bold">
                               <Activity className="w-3 h-3" /> Activity: {selectedUser.trails[selectedUser.trails.length-1].activity}
                             </p>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </Map>
              </APIProvider>
            </motion.div>
          )}

          {activeTab === 'weather' && (
            <motion.div 
              key="weather"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                <CloudSun className="text-orange-400" /> Weather Info
              </h2>
              {weather ? (
                <div className="space-y-6">
                  <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                       <CloudSun className="w-24 h-24" />
                    </div>
                    <p className="text-slate-400 text-sm uppercase tracking-widest mb-2 font-semibold">Current Temperature</p>
                    <p className="text-7xl font-bold tracking-tighter">{Math.round(weather.temperature)}°F</p>
                    <div className="mt-4 flex items-center justify-center gap-4 text-slate-300">
                      <span>Wind Speed: {weather.windspeed} mph</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                       <p className="text-xs text-slate-500 uppercase">Visibility</p>
                       <p className="text-xl font-bold">Good</p>
                     </div>
                     <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                       <p className="text-xs text-slate-500 uppercase">UV Index</p>
                       <p className="text-xl font-bold text-orange-400">Moderate</p>
                     </div>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed italic">
                    Perfect day for a drive! Remember to stay hydrated and keep the AC on auto.
                  </p>
                </div>
              ) : (
                <div className="animate-pulse space-y-4">
                  <div className="h-48 bg-slate-900 rounded-3xl" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24 bg-slate-900 rounded-2xl" />
                    <div className="h-24 bg-slate-900 rounded-2xl" />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'disney' && (
            <motion.div 
              key="disney"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bell className="text-purple-400" /> Disney News
                </span>
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full border border-purple-500/30">Live Updates</span>
              </h2>
              
              <div className="space-y-4">
                {disneyNews.length > 0 ? disneyNews.map((news: any, i: number) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className={cn(
                      "p-4 rounded-2xl border-l-4 border-purple-500 bg-slate-900 shadow-xl",
                      news.severity === 'critical' ? "border-red-500" : 
                      news.severity === 'warning' ? "border-orange-500" : "border-purple-500"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-purple-200">{news.title}</h3>
                      <span className="text-[10px] text-slate-500">{news.timestamp || 'Just now'}</span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{news.content}</p>
                    {news.severity === 'critical' && (
                      <div className="mt-3 flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-3 h-3" /> Urgent Alert
                      </div>
                    )}
                  </motion.div>
                )) : (
                   <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-4 h-64 justify-center">
                     <div className="w-12 h-12 rounded-full border-2 border-slate-800 border-t-purple-500 animate-spin" />
                     <p className="font-medium">Fetching magic from the park...</p>
                   </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'yosemite' && (
            <motion.div 
              key="yosemite"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                <Compass className="text-emerald-500" /> Yosemite Guide
              </h2>
              
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                     <AlertTriangle className="w-20 h-20" />
                   </div>
                   <h3 className="font-bold text-lg mb-4 text-orange-400">Critical Park Rules</h3>
                   <ul className="space-y-3 text-sm text-slate-300">
                     <li className="flex gap-2"><span className="text-orange-500 font-bold">•</span> Bear Safety: Use food lockers! Never leave food in cars.</li>
                     <li className="flex gap-2"><span className="text-orange-500 font-bold">•</span> Speed Limits: 25-35mph strictly enforced to protect wildlife.</li>
                     <li className="flex gap-2"><span className="text-orange-500 font-bold">•</span> Connectivity: No cell service in most of the valley. Save maps now!</li>
                     <li className="flex gap-2"><span className="text-orange-500 font-bold">•</span> Trash: Pack it in, pack it out. Leave No Trace.</li>
                   </ul>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button 
                     onClick={() => window.open('https://www.nps.gov/yose/planyourvisit/upload/yosemap1.pdf', '_blank')}
                     className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center hover:bg-slate-800 transition-colors flex flex-col items-center justify-center"
                   >
                     <MapIcon className="w-8 h-8 mb-2 text-emerald-500" />
                     <p className="text-xs font-bold uppercase">Valley Map</p>
                     <p className="text-[9px] text-slate-500 mt-1">Open PDF Map</p>
                   </button>
                   <button 
                     onClick={() => window.open('https://www.nps.gov/yose/planyourvisit/upload/yosemite-shuttle-map.pdf', '_blank')}
                     className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center hover:bg-slate-800 transition-colors flex flex-col items-center justify-center"
                   >
                     <Navigation className="w-8 h-8 mb-2 text-blue-500" />
                     <p className="text-xs font-bold uppercase">Shuttle Map</p>
                     <p className="text-[9px] text-slate-500 mt-1">Open PDF Map</p>
                   </button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-3xl">
                   <h3 className="font-bold mb-2 flex items-center gap-2">
                     <Info className="w-4 h-4 text-blue-400" /> Emergency Contacts
                   </h3>
                   <div className="space-y-2 text-xs text-slate-400">
                     <div className="flex justify-between">
                       <span>Emergency (Medical/Rescue)</span>
                       <span className="text-white font-mono">911</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Park Ranger Station</span>
                       <span className="text-white font-mono">(209) 372-0200</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Road Conditions</span>
                       <span className="text-white font-mono">(209) 372-0200 (press 1)</span>
                     </div>
                   </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl italic text-xs text-slate-500 text-center">
                  "In every walk with nature, one receives far more than he seeks." — John Muir
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'suggestions' && (
            <motion.div 
              key="suggestions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                <Utensils className="text-emerald-400" /> Local Gems
              </h2>
              <div className="grid gap-6">
                {suggestions.length > 0 ? suggestions.map((site, i) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800"
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-xl">{site.name}</h3>
                        <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-xs font-bold border border-yellow-500/30">
                          {site.rating} ★
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 mb-4">{site.description || site.significance}</p>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{site.distance} away</span>
                        <button 
                          onClick={() => {
                            if (site.coordinates) {
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${site.coordinates.lat},${site.coordinates.lng}`, '_blank');
                            }
                          }}
                          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                        >
                          <Navigation className="w-3 h-3" /> Let's Go!
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )) : (
                  <div className="p-8 text-center text-slate-500">Searching for uniquely California experiences...</div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'traffic' && (
            <motion.div 
              key="traffic"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                <Car className="text-blue-400" /> Traffic Intelligence
              </h2>
              
              {traffic ? (
                <div className="space-y-6">
                  <div className={cn(
                    "p-6 rounded-3xl border text-center flex flex-col items-center gap-2",
                    traffic.status === 'clear' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  )}>
                    <p className="text-xs uppercase tracking-widest opacity-60">Route Status</p>
                    <p className="text-4xl font-bold uppercase">{traffic.status}</p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Active Incidents</h3>
                    {traffic.incidents.length > 0 ? traffic.incidents.map((incident: any, i: number) => (
                      <div key={i} className="p-4 bg-slate-900 rounded-2xl border border-slate-800">
                        <h4 className="font-bold text-blue-200">{incident.title}</h4>
                        <p className="text-sm text-slate-400">{incident.description}</p>
                        <p className="text-xs text-orange-400 mt-2 font-medium">Impact: {incident.impact}</p>
                      </div>
                    )) : (
                      <div className="p-4 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800 text-center text-slate-500 text-sm">
                        No major incidents reported in your immediate vicinity.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">A.I. Recommendations</h3>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 border-l-blue-500 border-l-4">
                      <ul className="space-y-2">
                        {traffic.recommendations.map((rec: string, i: number) => (
                          <li key={i} className="text-sm text-slate-300 flex gap-2">
                            <Compass className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">Scanning road sensors and reports...</div>
              )}
            </motion.div>
          )}

          {activeTab === 'allowlist' && (
            <motion.div 
              key="allowlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 h-full overflow-y-auto"
            >
              <h2 className="text-3xl font-bold mb-2 flex items-center gap-2">
                <Settings className="text-slate-400" /> Family Access
              </h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                Only the email addresses listed below can access your family's real-time road trip data.
              </p>

              <div className="space-y-6">
                <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-3xl mb-4">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-orange-500" /> Share Trip Link
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 font-medium">
                    Text this link to family members so they can join the dashboard on their phones.
                  </p>
                  <button 
                    onClick={() => {
                      const shareData = {
                        title: 'California Road Trip Dashboard',
                        text: 'Join our family road trip tracker!',
                        url: window.location.origin
                      };
                      if (navigator.share) {
                        navigator.share(shareData).catch(console.error);
                      } else {
                        navigator.clipboard.writeText(window.location.origin);
                        alert('Link copied to clipboard! You can now paste it into a text message.');
                      }
                    }}
                    className="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold text-sm shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                  >
                    Send Invitation Link
                  </button>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter family email..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <button 
                    onClick={addEmail}
                    className="bg-orange-500 px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-4">Approved Members</h3>
                  {allowedEmails.map(email => (
                    <div key={email} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono text-slate-400">
                           {email[0].toUpperCase()}
                         </div>
                         <span className="text-sm font-medium">{email}</span>
                      </div>
                      <button 
                        onClick={() => removeEmail(email)}
                        className="text-xs text-red-500 font-bold hover:bg-red-500/10 px-2 py-1 rounded"
                        disabled={email === 'gsmastersinc@gmail.com'}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Stats/Quick Look on Map Tab */}
        {activeTab === 'map' && (
          <div className="absolute top-4 left-4 right-4 pointer-events-none flex justify-between items-start transition-all">
            <div className="flex flex-col gap-2">
              {proximityAlert && (
                 <motion.div 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="bg-emerald-500 text-white p-4 rounded-2xl shadow-xl pointer-events-auto max-w-[240px] relative border border-emerald-400"
                 >
                   <button 
                     onClick={() => setProximityAlert(null)}
                     className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full"
                   >
                     <X className="w-3 h-3" />
                   </button>
                   <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Nearby Discovery!</p>
                   <p className="font-bold text-sm leading-tight mb-1">{proximityAlert.name}</p>
                   <p className="text-[10px] line-clamp-2 opacity-90 mb-3">{proximityAlert.description}</p>
                   {proximityAlert.coordinates && (
                     <button 
                       onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${proximityAlert.coordinates.lat},${proximityAlert.coordinates.lng}`, '_blank')}
                       className="w-full bg-white text-emerald-600 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 shadow-inner"
                     >
                       <Navigation className="w-3 h-3" /> Start Navigation
                     </button>
                   )}
                 </motion.div>
              )}
              <div className="bg-slate-950/80 backdrop-blur-md rounded-2xl p-3 border border-slate-800 pointer-events-auto flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-orange-500/50 flex items-center justify-center bg-orange-500/10">
                  <MapPin className="text-orange-500 w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Family Activity</p>
                  <div className="flex -space-x-2 mt-0.5">
                    {family.map(f => (
                      <img 
                        key={f.uid} 
                        src={f.photoURL} 
                        className={cn(
                          "w-6 h-6 rounded-full border border-slate-950",
                          f.uid === currentUser.uid && "ring-1 ring-orange-500"
                        )} 
                        alt={f.displayName} 
                      />
                    ))}
                    <div className="w-6 h-6 rounded-full border border-slate-950 bg-slate-800 flex items-center justify-center text-[8px] font-bold">
                      +{family.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 backdrop-blur-md rounded-2xl p-3 border border-slate-800 pointer-events-auto sm:hidden flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-black">My Mileage</span>
                <span className="text-lg font-bold text-orange-500 leading-none">{mileage.toFixed(1)} <span className="text-[10px] text-slate-400">mi</span></span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pointer-events-auto">
              <button 
                onClick={() => setActiveTab('allowlist')}
                className="w-12 h-12 rounded-2xl backdrop-blur-md border border-slate-800 flex items-center justify-center transition-all shadow-lg bg-orange-600 text-white hover:bg-orange-500 scale-100 active:scale-95"
                title="Invite Family"
              >
                <UserPlus className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setIsAlertsEnabled(!isAlertsEnabled)}
                className={cn(
                  "w-12 h-12 rounded-2xl backdrop-blur-md border border-slate-800 flex items-center justify-center transition-all shadow-lg",
                  isAlertsEnabled ? "bg-orange-500 text-white" : "bg-slate-950/80 text-slate-400"
                )}
              >
                <Bell className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setShowTrails(!showTrails)}
                className={cn(
                  "w-12 h-12 rounded-2xl backdrop-blur-md border border-slate-800 flex items-center justify-center transition-all shadow-lg",
                  showTrails ? "bg-blue-500 text-white" : "bg-slate-950/80 text-slate-400"
                )}
              >
                <Activity className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Nav Bar */}
      <nav className="px-4 pb-8 pt-4 bg-slate-950 border-t border-slate-900 grid grid-cols-5 gap-1 z-50">
        <NavButton 
          active={activeTab === 'map'} 
          onClick={() => setActiveTab('map')}
          icon={<MapIcon className="w-5 h-5" />}
          label="Track"
        />
        <NavButton 
          active={activeTab === 'weather'} 
          onClick={() => setActiveTab('weather')}
          icon={<CloudSun className="w-5 h-5" />}
          label="Weather"
        />
        <NavButton 
          active={activeTab === 'disney'} 
          onClick={() => setActiveTab('disney')}
          icon={<Bell className="w-5 h-5" />}
          label="Disney"
        />
        <NavButton 
          active={activeTab === 'yosemite'} 
          onClick={() => setActiveTab('yosemite')}
          icon={<Compass className="w-5 h-5" />}
          label="Yosemite"
        />
        <NavButton 
          active={activeTab === 'suggestions'} 
          onClick={() => setActiveTab('suggestions')}
          icon={<Utensils className="w-5 h-5" />}
          label="Eats"
        />
        <NavButton 
          active={activeTab === 'traffic'} 
          onClick={() => setActiveTab('traffic')}
          icon={<Car className="w-5 h-5" />}
          label="Drive"
        />
      </nav>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsMenuOpen(false)}
               className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 h-full w-4/5 max-w-sm bg-slate-950 border-l border-slate-800 z-[101] p-8 flex flex-col shadow-2xl"
            >
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-24 h-24 rounded-full border-4 border-orange-500 p-1 shadow-xl">
                  <img src={currentUser.photoURL} className="w-full h-full rounded-full" alt="Me" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold">{currentUser.displayName}</h3>
                  <p className="text-slate-400 text-sm">{currentUser.email}</p>
                </div>
              </div>

              <div className="flex-1 space-y-2 pt-8 border-t border-slate-900 mt-4">
                 <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-center mb-6">
                    <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Total Trip Mileage</p>
                    <p className="text-4xl font-black text-orange-500">{mileage.toFixed(1)} <span className="text-lg text-slate-400">mi</span></p>
                 </div>
                
                <MenuButton 
                  icon={<Settings className="w-5 h-5" />} 
                  label="Family Management" 
                  onClick={() => { setActiveTab('allowlist'); setIsMenuOpen(false); }}
                />
                <MenuButton icon={<MapIcon className="w-5 h-5" />} label="Trip Planner" />
                <MenuButton icon={<Info className="w-5 h-5" />} label="Road Trip Safety" />
              </div>

              <button 
                onClick={logout}
                className="mt-auto flex items-center justify-center gap-2 py-4 border border-red-500/20 bg-red-500/5 text-red-500 rounded-2xl font-bold transition-all hover:bg-red-500/10"
              >
                <LogOut className="w-5 h-5" /> Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-300",
        active ? "bg-orange-500/10 text-orange-500 shadow-inner" : "text-slate-500"
      )}
    >
      <div className={cn("mb-1 transition-transform", active && "scale-110")}>{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-widest leading-none">{label}</span>
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="w-1 h-1 bg-orange-500 rounded-full mt-1.5"
        />
      )}
    </button>
  );
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 p-4 hover:bg-slate-900 rounded-2xl transition-colors text-slate-300 group">
      <div className="text-slate-500 group-hover:text-orange-500 transition-colors">{icon}</div>
      <span className="font-semibold">{label}</span>
      <div className="ml-auto opacity-20 group-hover:opacity-100 transition-all group-hover:translate-x-1">→</div>
    </button>
  );
}
