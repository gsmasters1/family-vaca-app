import { useEffect, useState, useRef } from 'react';
import { doc, setDoc, onSnapshot, collection, query, orderBy, limit, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export interface TrailPoint {
  lat: number;
  lng: number;
  timestamp: string;
  activity: 'walking' | 'driving' | 'stationary';
}

export interface UserLocation {
  uid: string;
  displayName: string;
  photoURL: string;
  location?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  trails?: TrailPoint[];
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useFamilyLocations() {
  const [family, setFamily] = useState<UserLocation[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mileage, setMileage] = useState(0);
  const lastPosRef = useRef<{ lat: number, lng: number, time: number } | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: user.displayName || 'Family Member',
          photoURL: user.photoURL || '',
          email: user.email
        }, { merge: true });
      }
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Listen to all users
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data() as UserLocation);
      
      // For each user, we'll want to subscribe to their trails too
      // But let's start with just updating the list of users
      setFamily(prev => {
        const newFamily = [...users];
        // Preserve trails if we already have them
        return newFamily.map(u => {
          const old = prev.find(p => p.uid === u.uid);
          return old ? { ...u, trails: old.trails } : u;
        });
      });
    });

    // Subscriptions for each family member's trails (limited to last 50 points)
    const trailUnsubscribes: (() => void)[] = [];
    
    // We update this whenever the family list changes to catch new members
    // This is a bit inefficient but works for a small group like a family of 5
    return () => {
      unsubscribeUsers();
      trailUnsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser]);

  // Separate effect to handle trail subscriptions for each family member
  useEffect(() => {
    if (!currentUser || family.length === 0) return;

    const unsubscribes = family.map(user => {
      const q = query(
        collection(db, 'users', user.uid, 'trails'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      
      return onSnapshot(q, (snapshot) => {
        const trails = snapshot.docs.map(doc => doc.data() as TrailPoint).reverse();
        setFamily(prev => prev.map(u => u.uid === user.uid ? { ...u, trails } : u));
        
        // If it's the current user, calculate mileage from trails
        if (user.uid === currentUser.uid) {
          let totalDist = 0;
          for (let i = 1; i < trails.length; i++) {
            totalDist += calculateDistance(trails[i-1].lat, trails[i-1].lng, trails[i].lat, trails[i].lng);
          }
          setMileage(totalDist * 0.621371);
        }
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [currentUser, family.map(f => f.uid).join(',')]);

  useEffect(() => {
    if (!currentUser) return;

    let watchId: number;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          const now = Date.now();
          
          setDoc(doc(db, 'users', currentUser.uid), {
            location: {
              lat: latitude,
              lng: longitude,
              updatedAt: new Date().toISOString()
            }
          }, { merge: true });

          // Breadcrumb saving logic
          if (!lastPosRef.current) {
            lastPosRef.current = { lat: latitude, lng: longitude, time: now };
            addDoc(collection(db, 'users', currentUser.uid, 'trails'), {
              lat: latitude,
              lng: longitude,
              timestamp: new Date().toISOString(),
              activity: 'stationary'
            });
          } else {
            const dist = calculateDistance(lastPosRef.current.lat, lastPosRef.current.lng, latitude, longitude);
            const timeDiff = (now - lastPosRef.current.time) / 1000;

            if (dist > 0.05 || (dist > 0.01 && timeDiff > 60)) {
              const activity = speed && speed > 4 ? 'driving' : (speed && speed > 0.5 ? 'walking' : 'stationary');
              addDoc(collection(db, 'users', currentUser.uid, 'trails'), {
                lat: latitude,
                lng: longitude,
                timestamp: new Date().toISOString(),
                activity
              });
              lastPosRef.current = { lat: latitude, lng: longitude, time: now };
            }
          }
        },
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [currentUser]);

  return { family, currentUser, mileage };
}
