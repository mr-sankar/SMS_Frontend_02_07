import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";


// Patch window.fetch to automatically include credentials: "include" for all relative API requests
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
    let isRelative = false;
    let urlString = "";
    if (typeof input === "string") {
        urlString = input;
        isRelative = input.startsWith("/") || input.startsWith(window.location.origin);
    } else if (input && typeof input === "object" && "url" in input) {
        urlString = input.url;
        isRelative = urlString.startsWith("/") || urlString.startsWith(window.location.origin);
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || "";
    if (isRelative && backendUrl) {
        if (typeof input === "string") {
            if (input.startsWith("/api") || input.startsWith("/uploads")) {
                input = `${backendUrl.replace(/\/+$/, "")}${input}`;
                isRelative = false;
            }
        } else if (input && typeof input === "object" && "url" in input) {
            if (input.url.startsWith("/api") || input.url.startsWith("/uploads")) {
                const newUrl = `${backendUrl.replace(/\/+$/, "")}${input.url}`;
                input = new Request(newUrl, input);
                isRelative = false;
            }
        }
    }
    
    const isTargetingBackend = isRelative || 
        (backendUrl && urlString.includes("/api/")) || 
        (backendUrl && (urlString.startsWith(backendUrl) || (typeof input === "object" && input.url?.startsWith(backendUrl))));

    if (isTargetingBackend) {
        if (!init) {
            init = {};
        }
        if (!init.credentials) {
            init.credentials = "include";
        }
        
        // Inject Authorization header if token is stored (bypasses third-party cookie blocks)
        const token = localStorage.getItem("authToken");
        if (token) {
            if (!init.headers) {
                init.headers = {};
            }
            if (init.headers instanceof Headers) {
                init.headers.set("Authorization", `Bearer ${token}`);
            } else if (Array.isArray(init.headers)) {
                init.headers.push(["Authorization", `Bearer ${token}`]);
            } else {
                init.headers["Authorization"] = `Bearer ${token}`;
            }
        }
    }
    
    const response = await originalFetch(input, init);
    
    if (response.ok) {
        if (urlString.includes("/auth/login")) {
            try {
                const clonedRes = response.clone();
                clonedRes.json().then(data => {
                    if (data && data.token) {
                        localStorage.setItem("authToken", data.token);
                    }
                }).catch(e => console.error("Error parsing login response for token:", e));
            } catch (e) {
                console.error("Error cloning login response:", e);
            }
        } else if (urlString.includes("/auth/logout")) {
            localStorage.removeItem("authToken");
        }
    }
    
    if (response.status === 401 && isTargetingBackend) {
        localStorage.removeItem("authToken");
        if (!urlString.includes("/auth/login") && !urlString.includes("/auth/me")) {
            // Redirect to login if session is expired or invalid
            window.location.href = "/login";
        }
    }
    
    return response;
};

document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")).render(<App />);

