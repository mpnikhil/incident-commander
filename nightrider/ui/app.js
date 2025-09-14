// Nightrider SRE Agent Dashboard JavaScript

const API_URL = 'https://svc-01k52w6389xbj4hxwt4zgpckc7.01k1v9y078eahcz45grz0g76p0.lmapp.run';

// Global state
let incidents = [];
let currentTab = 'dashboard';

// DOM elements
const apiStatusDot = document.getElementById('apiStatus');
const apiStatusText = document.getElementById('apiStatusText');
const totalIncidentsEl = document.getElementById('totalIncidents');
const criticalIncidentsEl = document.getElementById('criticalIncidents');
const autoRemediatedEl = document.getElementById('autoRemediated');
const avgResponseTimeEl = document.getElementById('avgResponseTime');
const recentIncidentsList = document.getElementById('recentIncidentsList');
const allIncidentsList = document.getElementById('allIncidentsList');
const severityFilter = document.getElementById('severityFilter');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshIncidents');
const incidentModal = document.getElementById('incidentModal');
const incidentModalTitle = document.getElementById('incidentModalTitle');
const incidentModalBody = document.getElementById('incidentModalBody');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    checkApiStatus();
    loadDashboardData();
    setupEventListeners();

    // Auto-refresh every 30 seconds
    setInterval(() => {
        if (currentTab === 'dashboard') {
            loadDashboardData();
        } else if (currentTab === 'incidents') {
            loadAllIncidents();
        }
    }, 30000);
});

// Tab management
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');

    currentTab = tabName;

    // Load data for specific tabs
    if (tabName === 'incidents') {
        loadAllIncidents();
    } else if (tabName === 'dashboard') {
        loadDashboardData();
    }
}

// Event listeners
function setupEventListeners() {
    refreshBtn.addEventListener('click', loadAllIncidents);
    severityFilter.addEventListener('change', filterIncidents);
    statusFilter.addEventListener('change', filterIncidents);

    // Close modal on outside click
    incidentModal.addEventListener('click', (e) => {
        if (e.target === incidentModal) {
            closeIncidentModal();
        }
    });
}

// API Status Check
async function checkApiStatus() {
    try {
        const response = await fetch(`${API_URL}/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            apiStatusDot.classList.add('online');
            apiStatusText.textContent = 'Online';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        apiStatusDot.classList.remove('online');
        apiStatusText.textContent = 'Offline';
        console.error('API Status Check Failed:', error);
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        await loadAllIncidents(false);
        updateDashboardStats();
        loadRecentIncidents();
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

// Load all incidents
async function loadAllIncidents(updateUI = true) {
    try {
        const response = await fetch(`${API_URL}/incidents`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        incidents = data.incidents || [];

        if (updateUI) {
            displayIncidents(incidents);
        }
    } catch (error) {
        console.error('Failed to load incidents:', error);
        if (updateUI) {
            allIncidentsList.innerHTML = '<div class="loading">Failed to load incidents</div>';
        }
    }
}

// Update dashboard statistics
function updateDashboardStats() {
    const total = incidents.length;
    const critical = incidents.filter(i => ['P0', 'P1'].includes(i.severity)).length;
    const autoRemediated = incidents.filter(i => i.status === 'resolved' && i.auto_remediated).length;
    const avgTime = calculateAverageResponseTime();

    totalIncidentsEl.textContent = total;
    criticalIncidentsEl.textContent = critical;
    autoRemediatedEl.textContent = autoRemediated;
    avgResponseTimeEl.textContent = avgTime;
}

// Calculate average response time
function calculateAverageResponseTime() {
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved');
    if (resolvedIncidents.length === 0) return '0m';

    // Mock calculation - in real app, would use actual timestamps
    const mockTimes = [2, 5, 15, 8, 12, 3, 25, 7];
    const total = mockTimes.reduce((sum, time) => sum + time, 0);
    const avg = Math.round(total / mockTimes.length);

    return `${avg}m`;
}

// Load recent incidents for dashboard
function loadRecentIncidents() {
    const recentIncidents = incidents
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);

    if (recentIncidents.length === 0) {
        recentIncidentsList.innerHTML = '<div class="loading">No recent incidents</div>';
        return;
    }

    recentIncidentsList.innerHTML = recentIncidents
        .map(incident => createIncidentCard(incident))
        .join('');
}

// Display incidents in the incidents tab
function displayIncidents(incidentsToShow) {
    if (incidentsToShow.length === 0) {
        allIncidentsList.innerHTML = '<div class="loading">No incidents found</div>';
        return;
    }

    allIncidentsList.innerHTML = incidentsToShow
        .map(incident => createIncidentCard(incident))
        .join('');
}

// Create incident card HTML
function createIncidentCard(incident) {
    const severityClass = incident.severity.toLowerCase();
    const statusIcon = getStatusIcon(incident.status);
    const timeAgo = formatTimeAgo(incident.timestamp);

    return `
        <div class="incident-card ${severityClass}" onclick="openIncidentModal('${incident.id}')">
            <div class="incident-header">
                <div>
                    <div class="incident-title">${incident.message}</div>
                    <div class="incident-meta">
                        <span class="badge ${getSeverityBadgeClass(incident.severity)}">${incident.severity}</span>
                        <span class="badge ${getStatusBadgeClass(incident.status)}">${incident.status}</span>
                        <span class="timing">${timeAgo}</span>
                    </div>
                </div>
                <div class="incident-status">
                    <span class="status-icon" style="background: ${statusIcon.color}"></span>
                    <span>${statusIcon.text}</span>
                </div>
            </div>
        </div>
    `;
}

// Get status icon and color
function getStatusIcon(status) {
    const statusMap = {
        'received': { color: '#ffc107', text: 'New' },
        'investigating': { color: '#17a2b8', text: 'Investigating' },
        'analyzing': { color: '#6f42c1', text: 'Analyzing' },
        'remediating': { color: '#fd7e14', text: 'Fixing' },
        'resolved': { color: '#28a745', text: 'Resolved' },
        'escalated': { color: '#dc3545', text: 'Escalated' }
    };

    return statusMap[status] || { color: '#6c757d', text: 'Unknown' };
}

// Get severity badge class
function getSeverityBadgeClass(severity) {
    const severityMap = {
        'P0': 'critical',
        'P1': 'high',
        'P2': 'medium',
        'P3': 'low'
    };

    return severityMap[severity] || 'info';
}

// Get status badge class
function getStatusBadgeClass(status) {
    const statusMap = {
        'received': 'info',
        'investigating': 'info',
        'analyzing': 'info',
        'remediating': 'medium',
        'resolved': 'success',
        'escalated': 'critical'
    };

    return statusMap[status] || 'info';
}

// Format timestamp to relative time
function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// Filter incidents
function filterIncidents() {
    const severityValue = severityFilter.value;
    const statusValue = statusFilter.value;

    let filtered = incidents;

    if (severityValue) {
        filtered = filtered.filter(incident => incident.severity === severityValue);
    }

    if (statusValue) {
        filtered = filtered.filter(incident => incident.status === statusValue);
    }

    displayIncidents(filtered);
}

// Modal functions
async function openIncidentModal(incidentId) {
    try {
        const response = await fetch(`${API_URL}/incidents/${incidentId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const incident = await response.json();
        displayIncidentModal(incident);
    } catch (error) {
        console.error('Failed to load incident details:', error);
        displayIncidentModal({
            id: incidentId,
            message: 'Failed to load incident details',
            error: true
        });
    }
}

function displayIncidentModal(incident) {
    if (incident.error) {
        incidentModalTitle.textContent = 'Error';
        incidentModalBody.innerHTML = `
            <div class="loading" style="color: #dc3545;">
                Failed to load incident details. Please try again.
            </div>
        `;
    } else {
        incidentModalTitle.textContent = `Incident ${incident.id}`;
        incidentModalBody.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3 style="color: #1e3c72; margin-bottom: 1rem;">Details</h3>
                <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p><strong>Message:</strong> ${incident.message}</p>
                    <p><strong>Severity:</strong> <span class="badge ${getSeverityBadgeClass(incident.severity)}">${incident.severity}</span></p>
                    <p><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(incident.status)}">${incident.status}</span></p>
                    <p><strong>Source:</strong> ${incident.source}</p>
                    <p><strong>Timestamp:</strong> ${new Date(incident.timestamp).toLocaleString()}</p>
                </div>

                ${incident.affected_services && incident.affected_services.length > 0 ? `
                <div style="margin-bottom: 1rem;">
                    <strong>Affected Services:</strong>
                    <div style="margin-top: 0.5rem;">
                        ${incident.affected_services.map(service => `<span class="badge info" style="margin-right: 0.5rem;">${service}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                ${incident.metadata ? `
                <div style="margin-bottom: 1rem;">
                    <strong>Metadata:</strong>
                    <pre style="background: #f8f9fa; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.9rem;">${JSON.stringify(incident.metadata, null, 2)}</pre>
                </div>
                ` : ''}

                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button class="demo-btn" onclick="viewAnalysis('${incident.id}')">
                        <i class="fas fa-search"></i> View Analysis
                    </button>
                    ${incident.severity === 'P0' || incident.severity === 'P1' ? `
                    <button class="demo-btn warning" onclick="triggerRemediation('${incident.id}')">
                        <i class="fas fa-wrench"></i> Trigger Remediation
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    incidentModal.classList.add('active');
}

function closeIncidentModal() {
    incidentModal.classList.remove('active');
}

// Analysis and remediation functions
async function viewAnalysis(incidentId) {
    try {
        const response = await fetch(`${API_URL}/incidents/${incidentId}/analysis`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const analysis = await response.json();
        displayAnalysis(analysis);
    } catch (error) {
        console.error('Failed to load analysis:', error);
        alert('Failed to load analysis. Please try again.');
    }
}

function displayAnalysis(analysis) {
    incidentModalBody.innerHTML = `
        <div style="margin-bottom: 2rem;">
            <h3 style="color: #1e3c72; margin-bottom: 1rem;">
                <i class="fas fa-search"></i> Root Cause Analysis
            </h3>

            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem;">
                <h4 style="color: #333; margin-bottom: 1rem;">Summary</h4>
                <p>${analysis.summary || 'Analysis in progress...'}</p>
            </div>

            ${analysis.root_cause ? `
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 1.5rem; margin-bottom: 1rem;">
                <h4 style="color: #856404; margin-bottom: 1rem;">Root Cause</h4>
                <p style="color: #856404;">${analysis.root_cause}</p>
            </div>
            ` : ''}

            ${analysis.recommendations && analysis.recommendations.length > 0 ? `
            <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 1.5rem; margin-bottom: 1rem;">
                <h4 style="color: #0c5460; margin-bottom: 1rem;">Recommendations</h4>
                <ul style="color: #0c5460; padding-left: 1.5rem;">
                    ${analysis.recommendations.map(rec => `<li style="margin-bottom: 0.5rem;">${rec}</li>`).join('')}
                </ul>
            </div>
            ` : ''}

            <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                <button class="demo-btn" onclick="closeIncidentModal(); openIncidentModal('${analysis.incident_id}')">
                    <i class="fas fa-arrow-left"></i> Back to Incident
                </button>
                ${analysis.can_auto_remediate ? `
                <button class="demo-btn critical" onclick="triggerRemediation('${analysis.incident_id}')">
                    <i class="fas fa-robot"></i> Auto-Remediate
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

async function triggerRemediation(incidentId) {
    if (!confirm('Are you sure you want to trigger remediation for this incident?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/incidents/${incidentId}/remediate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approved: true })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        alert('Remediation triggered successfully!');

        // Refresh incidents data
        await loadAllIncidents(currentTab === 'incidents');
        if (currentTab === 'dashboard') {
            loadDashboardData();
        }

        closeIncidentModal();
    } catch (error) {
        console.error('Failed to trigger remediation:', error);
        alert('Failed to trigger remediation. Please try again.');
    }
}

// Demo incident triggers
async function triggerDemoIncident(type) {
    const demoData = {
        database: {
            source: "DataDog",
            alert_type: "database_outage",
            severity: "P0",
            message: "Primary PostgreSQL database cluster is down - all write operations failing",
            affected_services: ["user-service", "order-service", "payment-service"],
            metadata: {
                cluster_id: "pg-prod-cluster-01",
                region: "us-west-2",
                error_rate: "100%",
                replica_status: "healthy",
                connection_pool_exhausted: true
            }
        },
        oom: {
            source: "Kubernetes",
            alert_type: "oom_crash",
            severity: "P2",
            message: "Pod analytics-worker-7d9f8b6c4d-x2m8n killed due to OOMKilled - memory limit exceeded",
            affected_services: ["analytics-service"],
            metadata: {
                namespace: "production",
                pod_name: "analytics-worker-7d9f8b6c4d-x2m8n",
                container: "analytics-processor",
                memory_limit: "512Mi",
                memory_usage_at_crash: "498Mi",
                restart_count: 3,
                can_auto_remediate: true
            }
        },
        disk: {
            source: "Prometheus",
            alert_type: "disk_space_high",
            severity: "P3",
            message: "Disk usage on /var/log partition exceeded 85% threshold",
            affected_services: ["logging-service", "metrics-collector"],
            metadata: {
                hostname: "app-server-03.prod",
                partition: "/var/log",
                current_usage: "87%",
                available_space: "2.1GB",
                threshold: "85%",
                trend: "increasing"
            }
        }
    };

    const incidentData = demoData[type];
    if (!incidentData) {
        alert('Unknown demo incident type');
        return;
    }

    incidentData.timestamp = new Date().toISOString();

    try {
        const response = await fetch(`${API_URL}/api/incidents/alert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(incidentData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        alert(`Demo incident created! ID: ${result.incident_id}`);

        // Switch to dashboard and refresh
        switchTab('dashboard');
        setTimeout(() => {
            loadDashboardData();
        }, 1000);

    } catch (error) {
        console.error('Failed to create demo incident:', error);
        alert('Failed to create demo incident. Please check the console for details.');
    }
}