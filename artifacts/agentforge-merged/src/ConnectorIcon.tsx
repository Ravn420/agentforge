import React from "react";

interface ConnectorIconProps {
  name: string;
  size?: number;
  className?: string;
}

export const ConnectorIcon: React.FC<ConnectorIconProps> = ({ name, size = 20, className = "" }) => {
  const norm = (name || "").toLowerCase().trim();

  // 1. Developer tools
  if (norm.includes("github")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`text-gray-900 ${className}`}>
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    );
  }

  if (norm.includes("gitlab")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
        <path fill="#FC6D26" d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.92l2.12-6.52a.84.84 0 011.6-.04l1.6 4.92h11.26l1.6-4.92a.84.84 0 011.6.04l2.12 6.52a.84.84 0 01-.3.92z" />
        <path fill="#E24329" d="M12 22.13l-5.63-17.3a.84.84 0 011.6-.04l4.03 12.39L12 22.13z" />
        <path fill="#FCA326" d="M12 22.13l5.63-17.3a.84.84 0 00-1.6-.04l-4.03 12.39L12 22.13z" />
      </svg>
    );
  }

  if (norm.includes("linear")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#5E6AD2" />
        <path d="M6 18L18 6M6 13.5L13.5 6M10.5 18L18 10.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("jira")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M11.5 3H6a1 1 0 00-1 1v5.5l6.5 6.5L18 10 11.5 3z" fill="#0052CC" />
        <path d="M12.5 13.5L19 7a1 1 0 011.4 0l.6.6a1 1 0 010 1.4l-8.5 8.5L6 11V4h6.5l0 9.5z" fill="#2684FF" />
      </svg>
    );
  }

  if (norm.includes("sentry")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M13.2 3.5a1.5 1.5 0 00-2.4 0L2.3 16.2a1.5 1.5 0 001.2 2.3h17a1.5 1.5 0 001.2-2.3L13.2 3.5z" fill="#362D59" />
        <path d="M12 7l5 9H7l5-9z" fill="#FB4226" />
      </svg>
    );
  }

  if (norm.includes("vercel")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`text-black ${className}`}>
        <path d="M12 2L22 20H2L12 2Z" />
      </svg>
    );
  }

  if (norm.includes("supabase")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M13.3 2.1a1 1 0 00-1.6.8V11H3.6a1 1 0 00-.8 1.6l8.5 10.3a1 1 0 001.6-.8V13h8.1a1 1 0 00.8-1.6L13.3 2.1z" fill="#3ECF8E" />
      </svg>
    );
  }

  if (norm.includes("postgresql") || norm.includes("postgres")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm3.5 13.5c-1.5 1.5-4 1.5-5.5 0l-3-3 1.4-1.4 3 3c.7.7 2 .7 2.7 0l4-4 1.4 1.4-4 4z" fill="#336791" />
      </svg>
    );
  }

  if (norm.includes("mongodb")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M12 2s-6 5.5-6 11c0 3.3 2.7 6 6 6s6-2.7 6-6c0-5.5-6-11-6-11zm.5 15.5v-13c2.8 1.2 4.5 4.1 4.5 7.5 0 3-1.8 5.1-4.5 5.5z" fill="#47A248" />
      </svg>
    );
  }

  // 2. Communication
  if (norm.includes("slack")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M6 15a2.5 2.5 0 112.5-2.5V15H6z" fill="#E01E5A" />
        <path d="M8.5 6a2.5 2.5 0 112.5 2.5H8.5V6z" fill="#2EB67D" />
        <path d="M18 9a2.5 2.5 0 11-2.5 2.5V9H18z" fill="#ECB22E" />
        <path d="M15.5 18a2.5 2.5 0 11-2.5-2.5h2.5V18z" fill="#1264A3" />
      </svg>
    );
  }

  if (norm.includes("discord")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="6" fill="#5865F2" />
        <path d="M17.5 7.5c-1-.5-2.1-.8-3.2-1a12.6 12.6 0 00-.5 1A13.8 13.8 0 0010.2 7.5a12.6 12.6 0 00-.5-1 12 12 0 00-3.2 1 12.8 12.8 0 00-2 8.5 12.7 12.7 0 003.9 2c.3-.4.6-.9.8-1.4-.4-.1-.8-.3-1.2-.5.1 0 .2-.1.3-.1 2.5 1.2 5.2 1.2 7.7 0 .1 0 .2.1.3.1-.4.2-.8.4-1.2.5.2.5.5 1 .8 1.4a12.7 12.7 0 003.9-2 12.8 12.8 0 00-2-8.5zM9 13.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm6 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("gmail")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M3 6.5V18a1.5 1.5 0 001.5 1.5h3V11L3 6.5z" fill="#4285F4" />
        <path d="M16.5 19.5h3A1.5 1.5 0 0021 18V6.5L16.5 11v8.5z" fill="#34A853" />
        <path d="M16.5 5.25L12 8.6 7.5 5.25A1.5 1.5 0 005.2 6.5L12 11.6l6.8-5.1a1.5 1.5 0 00-2.3-1.25z" fill="#EA4335" />
        <path d="M7.5 19.5v-8.5L12 14.4l4.5-3.4v8.5h-9z" fill="#FBBC04" />
      </svg>
    );
  }

  if (norm.includes("outlook")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
        <path d="M22 6.5l-10 7-10-7" stroke="white" strokeWidth="1.8" />
        <circle cx="8" cy="12" r="3" fill="#002050" opacity="0.3" />
      </svg>
    );
  }

  if (norm.includes("telegram")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#229ED9" />
        <path d="M17.5 7.5l-13 5 3.5 1.2 1.3 4.3 2.2-2.2 3.8 2.8 2.7-11.1zM9 13.5l6-3.8-4.5 4.3-.2 1.5L9 13.5z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("whatsapp")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#25D366" />
        <path d="M16.8 14.5c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.1-.8 1-1 1.2-.4.2-.7 0a8.8 8.8 0 01-2.6-1.6 9.7 9.7 0 01-1.8-2.2c-.2-.3 0-.5.1-.6s.3-.4.4-.5a1.8 1.8 0 00.3-.5.5.5 0 000-.5c0-.1-.7-1.7-1-2.3s-.5-.5-.7-.5h-.6a1.2 1.2 0 00-.9.4 3.7 3.7 0 00-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3s2.3 3.5 5.6 4.9c.8.3 1.4.5 1.9.7a4.6 4.6 0 002.1.1 3.4 3.4 0 002.2-1.5 2.7 2.7 0 00.2-1.5c-.1-.1-.3-.2-.6-.3z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("zoom")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="6" fill="#2D8CFF" />
        <path d="M5 8a1 1 0 011-1h7a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1V8zm10 2.5l4-2.5v8l-4-2.5v-3z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("twilio")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#F22F46" />
        <circle cx="8" cy="8" r="2" fill="white" />
        <circle cx="16" cy="8" r="2" fill="white" />
        <circle cx="8" cy="16" r="2" fill="white" />
        <circle cx="16" cy="16" r="2" fill="white" />
      </svg>
    );
  }

  // 3. Docs & knowledge
  if (norm.includes("notion")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`text-gray-900 ${className}`}>
        <path d="M4.5 3A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3h-15zm3 4h2.5l5 7V7H17v10h-2.5l-5-7v7H7.5V7z" />
      </svg>
    );
  }

  if (norm.includes("google drive") || norm.includes("drive")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M8 3h8l5 9h-8L8 3z" fill="#FFBA00" />
        <path d="M3 12l5-9 5 9H3z" fill="#0066DA" />
        <path d="M8 21l5-9h8l-5 9H8z" fill="#00AC47" />
      </svg>
    );
  }

  if (norm.includes("confluence")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M3.8 17.2c-.4-.5-.5-1.2-.2-1.7l5.5-9.3c.4-.7 1.4-.8 2-.2l2.2 2.2-5.5 9.3c-.4.7-1.4.8-2 .2l-2-2.2z" fill="#0052CC" />
        <path d="M20.2 6.8c.4.5.5 1.2.2 1.7l-5.5 9.3c-.4.7-1.4.8-2 .2l-2.2-2.2 5.5-9.3c.4-.7 1.4-.8 2-.2l2 2.2z" fill="#2684FF" />
      </svg>
    );
  }

  if (norm.includes("google docs") || norm.includes("docs")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="#4285F4" />
        <path d="M14 2v6h6l-6-6z" fill="#A0C2F9" />
        <path d="M8 13h8M8 17h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("airtable")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M11 3.5l-7 3v11l7-3v-11z" fill="#18BFF2" />
        <path d="M13 3.5l7 3v11l-7-3v-11z" fill="#2D7FF9" />
        <path d="M4 8l8 3.5L20 8" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }

  if (norm.includes("box") && !norm.includes("dropbox") && !norm.includes("sandbox")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#0061D5" />
        <path d="M6 7.5L12 4l6 3.5v9L12 20l-6-3.5v-9z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6 7.5l6 3.5 6-3.5M12 11v9" stroke="white" strokeWidth="1.8" />
      </svg>
    );
  }

  if (norm.includes("sharepoint")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="14.5" cy="8.5" r="4.5" fill="#038387" />
        <circle cx="8.5" cy="13.5" r="5.5" fill="#0078D4" opacity="0.9" />
        <circle cx="16.5" cy="15.5" r="3.5" fill="#107C41" opacity="0.9" />
      </svg>
    );
  }

  if (norm.includes("onedrive")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M10.1 12.3a4.2 4.2 0 017.9 1.2A3.8 3.8 0 0118.5 21H6.5a4.5 4.5 0 01-.8-8.9 5.5 5.5 0 0110.4-1.8z" fill="#0078D4" />
        <path d="M14.5 8a4.5 4.5 0 00-8.3 1.8 5.5 5.5 0 00-3 9.7A4.5 4.5 0 017 11.5a5.5 5.5 0 017.5-3.5z" fill="#00A4EF" opacity="0.7" />
      </svg>
    );
  }

  // 4. AI & Data
  if (norm.includes("openai")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`text-gray-900 ${className}`}>
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.259 23a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7466-6.073zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
      </svg>
    );
  }

  if (norm.includes("anthropic")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#D97757" />
        <path d="M14.2 6h-4.4L5.5 18h2.8l1.1-3h5.2l1.1 3h2.8L14.2 6zm-3.8 6.8l1.8-5 1.8 5h-3.6z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("hugging face") || norm.includes("huggingface")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#FFD21E" />
        <circle cx="8" cy="10" r="1.5" fill="#000" />
        <circle cx="16" cy="10" r="1.5" fill="#000" />
        <path d="M8 15c1.5 2 6.5 2 8 0" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("pinecone")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#000000" />
        <path d="M12 4l6 10H6l6-10zm0 6l3 5H9l3-5z" fill="#00E5A3" />
      </svg>
    );
  }

  if (norm.includes("bigquery")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#4285F4" />
        <circle cx="11" cy="11" r="5" stroke="white" strokeWidth="2" fill="none" />
        <path d="M15 15l4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M9 11h4M11 9v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 5. Cloud & Infra
  if (norm.includes("aws")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#232F3E" />
        <path d="M6 14c4 3 8 3 12 0m-2-1l2 1-1 2" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (norm.includes("cloudflare")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M19.4 13.2A4.5 4.5 0 0015 8.5a4.4 4.4 0 00-3.5 1.7A6 6 0 005 15h14.4z" fill="#F38020" />
        <path d="M19.4 13.2L18 15h2.5a2.5 2.5 0 00-1.1-1.8z" fill="#FAAD3F" />
      </svg>
    );
  }

  if (norm.includes("digitalocean") || norm.includes("digital ocean")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#0080FF" />
        <path d="M12 4a8 8 0 018 8h-3a5 5 0 10-5 5v3a8 8 0 01-8-8c0-4.4 3.6-8 8-8z" fill="white" />
        <rect x="12" y="17" width="2" height="2" fill="white" />
        <rect x="9" y="19" width="2" height="2" fill="white" />
      </svg>
    );
  }

  if (norm.includes("railway")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#0B0D0E" />
        <path d="M6 15l6-6 6 6M6 9l6 6 6-6" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // 6. Design & product
  if (norm.includes("figma")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M8 2h4v4H8a2 2 0 110-4z" fill="#F24E1E" />
        <path d="M12 2h4a2 2 0 110 4h-4V2z" fill="#FF7262" />
        <path d="M12 6h4a2 2 0 110 4h-4V6z" fill="#1ABCFE" />
        <path d="M8 6a2 2 0 100 4 2 2 0 000-4z" fill="#A259FF" />
        <path d="M8 10a2 2 0 100 4 2 2 0 000-4z" fill="#0ACF83" />
        <path d="M8 14a2 2 0 102 2V14H8z" fill="#0ACF83" />
      </svg>
    );
  }

  if (norm.includes("canva")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#00C4CC" />
        <path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 9a3 3 0 110-6 3 3 0 010 6z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("product hunt") || norm.includes("producthunt")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#DA552F" />
        <path d="M9 7h4a3 3 0 010 6H9V7zm0 6h4M9 7v10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // 7. Business & Commerce
  if (norm.includes("stripe")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#635BFF" />
        <path d="M13.8 10.2c0-.7-.6-1-1.5-1-1.4 0-3.1.5-4.4 1.2V7.7c1.5-.6 3.2-.9 4.8-.9 3.6 0 5.8 1.8 5.8 4.7 0 4.6-6.3 3.9-6.3 5.9 0 .8.7 1.1 1.8 1.1 1.6 0 3.6-.6 5-1.4v2.7c-1.6.7-3.4 1.1-5.2 1.1-3.7 0-6.1-1.8-6.1-4.7.2-4.9 6.1-4.1 6.1-6z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("shopify")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M16 5l-2-2H10L8 5H3l2 15h14l2-15h-5z" fill="#95BF47" />
        <path d="M12 3v16" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }

  if (norm.includes("hubspot")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#FF7A59" />
        <path d="M16.5 8.5a2 2 0 100-4 2 2 0 000 4zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM7.5 19.5a2 2 0 100-4 2 2 0 000 4z" fill="white" />
        <path d="M9 16.5l3-3.5 3-3" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("salesforce")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <path d="M19.5 9.5a4.5 4.5 0 00-8.2-2.1A5.5 5.5 0 003 12.5a5.5 5.5 0 005.5 5.5h11a4.5 4.5 0 000-9z" fill="#00A1E0" />
        <path d="M9.5 12l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (norm.includes("quickbooks")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#2CA01C" />
        <path d="M9 8v8M9 12a3 3 0 003-3V8M15 8v8M15 12a3 3 0 01-3 3v1" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("google search console") || norm.includes("search console")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#4285F4" />
        <path d="M5 17l4-5 4 3 6-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="8" r="1.5" fill="#EA4335" />
      </svg>
    );
  }

  // 8. Media & Social
  if (norm.includes("youtube")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
        <path d="M10 9l5 3-5 3V9z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("x (twitter)") || norm.includes("twitter") || norm === "x") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`text-black ${className}`}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  if (norm.includes("reddit")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="#FF4500" />
        <circle cx="12" cy="12" r="5" fill="white" />
        <circle cx="10" cy="11" r="1" fill="#FF4500" />
        <circle cx="14" cy="11" r="1" fill="#FF4500" />
        <path d="M10 14c1 1 3 1 4 0" stroke="#FF4500" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("hacker news") || norm.includes("hackernews")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="4" fill="#FF6600" />
        <path d="M7 6l5 7v5h2v-5l5-7h-2.5L13 11.5 9.5 6H7z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("linkedin")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#0A66C2" />
        <path d="M6 10h2.5v8H6v-8zm1.25-3.5a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM11 10h2.4v1.1h.1c.3-.6 1.2-1.3 2.4-1.3 2.6 0 3.1 1.7 3.1 3.9V18h-2.5v-3.7c0-.9 0-2.1-1.3-2.1-1.3 0-1.5 1-1.5 2V18H11v-8z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("instagram")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="6" fill="url(#igGrad)" />
        <defs>
          <linearGradient id="igGrad" x1="2" y1="22" x2="22" y2="2">
            <stop offset="0%" stopColor="#FFDC80" />
            <stop offset="25%" stopColor="#F77737" />
            <stop offset="50%" stopColor="#F56040" />
            <stop offset="75%" stopColor="#FD1D1D" />
            <stop offset="100%" stopColor="#E1306C" />
          </linearGradient>
        </defs>
        <rect x="5" y="5" width="14" height="14" rx="4" stroke="white" strokeWidth="2" fill="none" />
        <circle cx="12" cy="12" r="3.5" stroke="white" strokeWidth="2" fill="none" />
        <circle cx="15.5" cy="8.5" r="1" fill="white" />
      </svg>
    );
  }

  if (norm.includes("tiktok")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#000000" />
        <path d="M16.5 7.5a4.5 4.5 0 00-3.5-3.5V14a3 3 0 11-3-3c.3 0 .6 0 .9.1V8.2a5.9 5.9 0 00-.9-.1 5.9 5.9 0 105.9 5.9V9.2a7.4 7.4 0 004.1 1.2V7.5a4.5 4.5 0 01-3.5-3.5z" fill="#00F2FE" />
        <path d="M16 7a4.5 4.5 0 00-3.5-3.5V13.5a3 3 0 11-3-3c.3 0 .6 0 .9.1V7.7a5.9 5.9 0 00-.9-.1 5.9 5.9 0 105.9 5.9V8.7a7.4 7.4 0 004.1 1.2V7a4.5 4.5 0 01-3.5-3.5z" fill="#FE2C55" opacity="0.8" />
      </svg>
    );
  }

  // 9. Search & research
  if (norm.includes("tavily")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#00B4D8" />
        <path d="M7 8h10M12 8v9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("exa")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#6C5CE7" />
        <path d="M7 7h10M7 12h7M7 17h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("brave")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#FF1B2D" />
        <path d="M8 6h5a3 3 0 010 6H8V6zm0 6h6a3 3 0 010 6H8v-6z" fill="white" />
      </svg>
    );
  }

  if (norm.includes("kagi")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#FFC107" />
        <path d="M7 6l5 6-5 6M12 6l5 6-5 6" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (norm.includes("pubmed")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#124B7B" />
        <path d="M6 6h6a3 3 0 010 6H6V6zm0 6h7a3 3 0 010 6H6v-6z" fill="white" />
        <path d="M17 6v12" stroke="#4DA1FF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes("arxiv")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className}>
        <rect width="24" height="24" rx="5" fill="#B31B1B" />
        <path d="M7 17l5-10 5 10M9 13h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // Fallback generic badge icon with stylish gradient
  return (
    <div className={`w-[22px] h-[22px] rounded-md bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider ${className}`}>
      {name.slice(0, 2)}
    </div>
  );
};

export default ConnectorIcon;
