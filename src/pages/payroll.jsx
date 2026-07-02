import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
    Landmark, CheckCircle, Calendar, PlusCircle, AlertCircle, 
    Wallet, Edit, DollarSign, Search, Filter, Download, 
    FileText, FileSpreadsheet, Eye, X, Loader2, RefreshCw 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Payroll() {
    const qc = useQueryClient();
    const { toast } = useToast();
    
    // Filters State
    const [month, setMonth] = useState("6");
    const [year, setYear] = useState("2026");
    const [department, setDepartment] = useState("all");
    const [designation, setDesignation] = useState("all");
    const [paymentStatus, setPaymentStatus] = useState("all");

    // Modal States
    const [payRecord, setPayRecord] = useState(null);
    const [editRecord, setEditRecord] = useState(null);
    const [remarks, setRemarks] = useState("");
    const [overrideLeaves, setOverrideLeaves] = useState("");
    const [isSubmittingPay, setIsSubmittingPay] = useState(false);
    const [isSubmittingLeaves, setIsSubmittingLeaves] = useState(false);
    const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);

    // Fetch Salaries
    const { data: salaries = [], isLoading, refetch } = useQuery({
        queryKey: ["salaries", month, year],
        queryFn: async () => {
            const res = await fetch(`/api/salary?month=${month}&year=${year}`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch salary records");
            return res.json();
        },
        staleTime: 5000,
    });

    // Extract list of unique departments/designations for filters
    const departments = useMemo(() => {
        const set = new Set(salaries.map(s => s.department).filter(Boolean));
        return Array.from(set);
    }, [salaries]);

    const designations = useMemo(() => {
        const set = new Set(salaries.map(s => s.designation).filter(Boolean));
        return Array.from(set);
    }, [salaries]);

    // Apply Client-Side Filters
    const filteredSalaries = useMemo(() => {
        return salaries.filter(s => {
            const matchesDept = department === "all" || s.department === department;
            const matchesDesig = designation === "all" || s.designation === designation;
            const matchesStatus = paymentStatus === "all" || s.paymentStatus === paymentStatus;
            return matchesDept && matchesDesig && matchesStatus;
        });
    }, [salaries, department, designation, paymentStatus]);

    // Summary Calculations
    const stats = useMemo(() => {
        const totalEmployees = salaries.length;
        const totalPaid = salaries.filter(s => s.paymentStatus === "Paid").length;
        const totalPending = totalEmployees - totalPaid;
        
        let totalPayable = 0;
        let totalPF = 0;
        let totalPT = 0;
        let totalLeaveDeductions = 0;
        let totalNetPayable = 0;

        salaries.forEach(s => {
            totalPayable += s.grossSalary;
            totalPF += s.pf;
            totalPT += s.pt;
            totalLeaveDeductions += s.leaveDeduction;
            totalNetPayable += s.netSalary;
        });

        return {
            totalEmployees,
            totalPaid,
            totalPending,
            totalPayable,
            totalPF,
            totalPT,
            totalLeaveDeductions,
            totalNetPayable
        };
    }, [salaries]);

    // Trigger Salary Sheet Generation
    const handleGenerateSalary = async () => {
        setIsGeneratingSheet(true);
        try {
            const res = await fetch("/api/salary/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: parseInt(month), year: parseInt(year) }),
                credentials: "include",
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: "Salary Sheet Generated", description: data.message });
                qc.invalidateQueries({ queryKey: ["salaries"] });
            } else {
                toast({ title: "Failed", description: data.error || "Failed to generate salary sheet", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsGeneratingSheet(false);
        }
    };

    // Override Leaves Submit
    const handleOverrideLeavesSubmit = async () => {
        if (!editRecord) return;
        setIsSubmittingLeaves(true);
        try {
            const res = await fetch(`/api/salary/${editRecord.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leaveDays: parseFloat(overrideLeaves) }),
                credentials: "include"
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: "Success", description: "Leave count overridden and salary recalculated" });
                setEditRecord(null);
                refetch();
            } else {
                toast({ title: "Failed", description: data.error || "Failed to override leaves", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsSubmittingLeaves(false);
        }
    };

    // Pay Salary Submit
    const handleConfirmPayment = async () => {
        if (!payRecord) return;
        setIsSubmittingPay(true);
        try {
            const res = await fetch(`/api/salary/pay/${payRecord.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ remarks }),
                credentials: "include"
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: "Payment Processed", description: `Transaction Reference: ${data.transactionReference}. Downloading payslip...` });
                const salaryId = payRecord.id;
                setPayRecord(null);
                setRemarks("");
                refetch();
                // Auto-download payslip after successful payment
                handleDownloadPayslip(salaryId);
            } else {
                toast({ title: "Payment Failed", description: data.error || "Failed to disburse salary", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsSubmittingPay(false);
        }
    };

    // Download Payslip PDF programmatically (works reliably with auth cookies)
    const handleDownloadPayslip = async (salaryId) => {
        try {
            const res = await fetch(`/api/payslip/download/${salaryId}`, {
                credentials: "include"
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                toast({ title: "Download Failed", description: errData.error || "Could not download payslip", variant: "destructive" });
                return;
            }
            const blob = await res.blob();
            const contentDisposition = res.headers.get("Content-Disposition");
            let filename = `payslip_${salaryId}.pdf`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename=([^;\s]+)/);
                if (match) filename = match[1];
            }
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast({ title: "Payslip Downloaded", description: `${filename} saved successfully` });
        } catch (err) {
            toast({ title: "Download Error", description: err.message, variant: "destructive" });
        }
    };

    // Exports
    const exportCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Employee Name,Staff ID,Designation,Department,Gross Salary,Basic Salary,PF,PT,Leaves,Leave Deduction,Total Deduction,Net Salary,Payment Status\n";
        
        filteredSalaries.forEach(s => {
            csvContent += `"${s.employeeName}","${s.staffIdStr}","${s.designation}","${s.department}",${s.grossSalary},${s.basicSalary},${s.pf},${s.pt},${s.leaveDays},${s.leaveDeduction},${s.totalDeduction},${s.netSalary},"${s.paymentStatus}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Salary_Sheet_${month}_${year}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportExcel = () => {
        exportCSV(); // In standard simple client JS, Excel downloads as CSV for compatibility
    };

    const printPage = () => {
        window.print();
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <Landmark className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-serif font-bold text-white tracking-wide">Salary Management</h1>
                        <p className="text-muted-foreground text-xs mt-0.5">Generate, verify, disburse payroll, and monitor staff salary sheets</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        onClick={handleGenerateSalary} 
                        disabled={isGeneratingSheet}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs rounded-xl shadow-lg border border-purple-500/40 px-4 py-2 flex items-center gap-2"
                    >
                        {isGeneratingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                        Generate Salary Sheet
                    </Button>
                    <Button 
                        onClick={exportExcel}
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 text-xs text-slate-300 rounded-xl px-3 py-2 flex items-center gap-1.5"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export Excel
                    </Button>
                    <Button 
                        onClick={printPage}
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 text-xs text-slate-300 rounded-xl px-3 py-2 flex items-center gap-1.5"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Export PDF
                    </Button>
                </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-4 flex flex-col justify-between h-full min-h-[90px]">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Employees</p>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-xl font-bold text-white">{stats.totalEmployees}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Active</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-4 flex flex-col justify-between h-full min-h-[90px]">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Status (Paid / Pending)</p>
                        <div className="flex items-baseline justify-between mt-2">
                            <div className="space-x-1.5">
                                <span className="text-xl font-bold text-emerald-400">{stats.totalPaid}</span>
                                <span className="text-xs text-slate-500">/</span>
                                <span className="text-sm font-semibold text-amber-500">{stats.totalPending}</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Payment</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-4 flex flex-col justify-between h-full min-h-[90px]">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Deductions (PF/PT/Leave)</p>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-xl font-bold text-red-400">₹{(stats.totalLeaveDeductions + stats.totalPF + stats.totalPT) > 0 ? (stats.totalLeaveDeductions + stats.totalPF + stats.totalPT).toLocaleString("en-IN", {maximumFractionDigits:0}) : "0"}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Deducted</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-4 flex flex-col justify-between h-full min-h-[90px]">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Net Salary Payable</p>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-xl font-bold text-white">₹{stats.totalNetPayable.toLocaleString("en-IN", {maximumFractionDigits:0})}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Net Total</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters panel */}
            <Card className="glass-card border border-white/5 bg-[#08060c]/40">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-purple-400 text-xs font-semibold uppercase tracking-wider">
                        <Filter className="w-3.5 h-3.5" />
                        <span>Filter Records</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Month</label>
                            <select 
                                className="w-full bg-[#110e1a]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                            >
                                <option value="1">January</option>
                                <option value="2">February</option>
                                <option value="3">March</option>
                                <option value="4">April</option>
                                <option value="5">May</option>
                                <option value="6">June</option>
                                <option value="7">July</option>
                                <option value="8">August</option>
                                <option value="9">September</option>
                                <option value="10">October</option>
                                <option value="11">November</option>
                                <option value="12">December</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Year</label>
                            <select 
                                className="w-full bg-[#110e1a]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                            >
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                                <option value="2027">2027</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Department</label>
                            <select 
                                className="w-full bg-[#110e1a]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                            >
                                <option value="all">All Departments</option>
                                {departments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Designation</label>
                            <select 
                                className="w-full bg-[#110e1a]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                value={designation}
                                onChange={(e) => setDesignation(e.target.value)}
                            >
                                <option value="all">All Roles</option>
                                {designations.map(d => (
                                    <option key={d} value={d}>{d.replace(/_/g, " ").toUpperCase()}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="text-[10px] text-slate-400 block mb-1">Payment Status</label>
                            <select 
                                className="w-full bg-[#110e1a]/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                                value={paymentStatus}
                                onChange={(e) => setPaymentStatus(e.target.value)}
                            >
                                <option value="all">All Statuses</option>
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Salary Processing Table */}
            <Card className="glass-card border border-white/5 bg-[#08060c]/40 overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 space-y-4">
                            <Skeleton className="h-6 w-full bg-white/5" />
                            <Skeleton className="h-24 w-full bg-white/5" />
                        </div>
                    ) : filteredSalaries.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Landmark className="w-12 h-12 mx-auto text-purple-400 opacity-40 mb-3" />
                            <p className="font-semibold text-purple-400">No salary statement generated for this period</p>
                            <p className="text-xs mt-1 max-w-sm mx-auto">Click "Generate Salary Sheet" above to compute the initial salary calculations for all active staff members.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-white/4 text-slate-300 font-bold border-b border-white/5">
                                        <th className="p-3">Employee Name</th>
                                        <th className="p-3">Staff ID</th>
                                        <th className="p-3">Department</th>
                                        <th className="p-3 text-right">Gross Salary</th>
                                        <th className="p-3 text-right">Basic (50%)</th>
                                        <th className="p-3 text-right">PF (12%)</th>
                                        <th className="p-3 text-right">PT</th>
                                        <th className="p-3 text-center">Leaves</th>
                                        <th className="p-3 text-right">Leave Ded.</th>
                                        <th className="p-3 text-right">Total Ded.</th>
                                        <th className="p-3 text-right">Net Salary</th>
                                        <th className="p-3 text-center">Status</th>
                                        <th className="p-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredSalaries.map((s) => (
                                        <tr key={s.id} className="hover:bg-white/2 transition-colors">
                                            <td className="p-3 font-semibold text-white">{s.employeeName}</td>
                                            <td className="p-3 text-slate-400 font-mono">{s.staffIdStr}</td>
                                            <td className="p-3 text-slate-400">{s.department}</td>
                                            <td className="p-3 text-right text-slate-300">₹{s.grossSalary.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right text-slate-400">₹{s.basicSalary.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right text-slate-400">₹{s.pf.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right text-slate-400">₹{s.pt}</td>
                                            <td className="p-3 text-center text-slate-300 font-semibold">{s.leaveDays}</td>
                                            <td className="p-3 text-right text-red-400/80">₹{s.leaveDeduction.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right text-red-400 font-medium">₹{s.totalDeduction.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right font-bold text-white">₹{s.netSalary.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-center">
                                                <Badge className={
                                                    s.paymentStatus === "Paid" 
                                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10" 
                                                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10"
                                                }>
                                                    {s.paymentStatus}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {s.paymentStatus === "Pending" ? (
                                                        <>
                                                            <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                onClick={() => {
                                                                    setEditRecord(s);
                                                                    setOverrideLeaves(String(s.leaveDays));
                                                                }}
                                                                title="Override Leaves"
                                                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                onClick={() => {
                                                                    setPayRecord(s);
                                                                    setRemarks("");
                                                                }}
                                                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2 py-1 text-[10px] h-7 flex items-center gap-1"
                                                            >
                                                                <Wallet className="w-3.5 h-3.5" />
                                                                Pay
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button 
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDownloadPayslip(s.id)}
                                                            className="h-7 px-2.5 rounded-lg text-purple-400 hover:text-white hover:bg-purple-500/10 text-[10px] flex items-center gap-1"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                            Download Payslip
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modals */}
            <AnimatePresence>
                {/* 1. Pay Salary Confirmation Modal */}
                {payRecord && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#120f1f] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <Wallet className="w-5 h-5" />
                                    <h3 className="font-serif font-bold text-base text-white">Disburse Monthly Salary</h3>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setPayRecord(null)} className="text-slate-400 hover:text-white rounded-lg w-7 h-7">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="p-5 space-y-4 text-xs">
                                <div className="grid grid-cols-2 gap-3 bg-white/2 p-3 rounded-xl border border-white/5">
                                    <div>
                                        <p className="text-slate-400 text-[10px] uppercase">Employee Name</p>
                                        <p className="font-semibold text-white mt-0.5">{payRecord.employeeName}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-[10px] uppercase">Staff ID</p>
                                        <p className="font-mono text-white mt-0.5">{payRecord.staffIdStr}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-[10px] uppercase">Period</p>
                                        <p className="font-semibold text-white mt-0.5">{month}/{year}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-[10px] uppercase">Leaves</p>
                                        <p className="font-semibold text-white mt-0.5">{payRecord.leaveDays} Days</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-semibold text-slate-300">Salary breakdown</h4>
                                    <div className="space-y-1.5 divide-y divide-white/5">
                                        <div className="flex justify-between py-1 text-slate-400">
                                            <span>Gross Salary</span>
                                            <span className="text-white">₹{payRecord.grossSalary.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 text-slate-400">
                                            <span>Provident Fund (PF)</span>
                                            <span className="text-red-400">-₹{payRecord.pf.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 text-slate-400">
                                            <span>Professional Tax (PT)</span>
                                            <span className="text-red-400">-₹{payRecord.pt.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 text-slate-400">
                                            <span>Leave Deduction</span>
                                            <span className="text-red-400">-₹{payRecord.leaveDeduction.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                        </div>
                                        <div className="flex justify-between py-2 text-slate-300 font-bold bg-white/2 px-2 rounded-lg">
                                            <span className="text-emerald-400">Net Take-Home</span>
                                            <span className="text-emerald-400">₹{payRecord.netSalary.toLocaleString("en-IN", {minimumFractionDigits:2})}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-slate-400 block">Remarks / Notes</label>
                                    <input 
                                        type="text" 
                                        placeholder="Regular monthly salary transfer" 
                                        className="w-full bg-[#1b172d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-400 text-xs"
                                        value={remarks}
                                        onChange={(e) => setRemarks(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-white/2 border-t border-white/5 flex items-center justify-end gap-2">
                                <Button variant="ghost" onClick={() => setPayRecord(null)} className="text-slate-400 hover:text-white rounded-xl text-xs px-4">
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleConfirmPayment} 
                                    disabled={isSubmittingPay}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs px-4 flex items-center gap-1.5"
                                >
                                    {isSubmittingPay && <Loader2 className="w-3 h-3 animate-spin" />}
                                    Confirm Payment
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* 2. Override Leave Days Modal */}
                {editRecord && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#120f1f] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-purple-400">
                                    <Edit className="w-5 h-5" />
                                    <h3 className="font-serif font-bold text-base text-white">Override Leave Days</h3>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setEditRecord(null)} className="text-slate-400 hover:text-white rounded-lg w-7 h-7">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="p-5 space-y-3 text-xs">
                                <p className="text-slate-400">
                                    Override leaves for <span className="font-semibold text-white">{editRecord.employeeName}</span> for the period {month}/{year}. Net salary will be recalculated automatically.
                                </p>
                                
                                <div className="space-y-1">
                                    <label className="text-slate-400 block">Number of Leave Days</label>
                                    <input 
                                        type="number" 
                                        step="0.5"
                                        min="0"
                                        max="31"
                                        className="w-full bg-[#1b172d] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-400 text-xs"
                                        value={overrideLeaves}
                                        onChange={(e) => setOverrideLeaves(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-white/2 border-t border-white/5 flex items-center justify-end gap-2">
                                <Button variant="ghost" onClick={() => setEditRecord(null)} className="text-slate-400 hover:text-white rounded-xl text-xs px-4">
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleOverrideLeavesSubmit} 
                                    disabled={isSubmittingLeaves}
                                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs px-4 flex items-center gap-1.5"
                                >
                                    {isSubmittingLeaves && <Loader2 className="w-3 h-3 animate-spin" />}
                                    Recalculate Salary
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}