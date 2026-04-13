import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "./components/nav";
import Footer from "./components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "wall402 — x402 paywall for agents on X Layer",
  description:
    "Turn any API into an agent-payable endpoint with zero-gas settlement on X Layer.",
};

// Inline script to set theme before first paint — prevents flash.
const themeScript = `(function(){try{var t=localStorage.getItem('wall402-theme');if(t==='dark'||(t==null&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.setAttribute('data-theme','dark');else document.documentElement.setAttribute('data-theme','light')}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Nav />
        <div style={{ flex: 1 }}>
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
