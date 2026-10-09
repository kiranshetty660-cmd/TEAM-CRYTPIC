"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { DemoUser, DEMO_USERS } from "./types";

interface UserContextType {
  currentUser: DemoUser;
  setCurrentUser: (user: DemoUser) => void;
  users: DemoUser[];
}

const UserContext = createContext<UserContextType>({
  currentUser: DEMO_USERS[0],
  setCurrentUser: () => {},
  users: DEMO_USERS,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<DemoUser>(DEMO_USERS[0]);

  useEffect(() => {
    const saved = localStorage.getItem("tracerx_active_user");
    if (saved) {
      const match = DEMO_USERS.find((u) => u.id === saved);
      if (match) setCurrentUser(match);
    }
  }, []);

  const handleSetUser = (u: DemoUser) => {
    setCurrentUser(u);
    localStorage.setItem("tracerx_active_user", u.id);
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: handleSetUser, users: DEMO_USERS }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
