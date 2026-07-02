import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
    Wallet, Download, Landmark, FileText, CheckCircle, 
    AlertCircle, Calendar, CalendarDays, TrendingUp 
} from "lucide-react";
import { motion } from "framer-motion";
export default function MySalary() {
    // 1. Fetch Salary History
    const { data: history = [], isLoading: isLoadingHistory } = useQuery({
        queryKey: ["my-salaries"],
        queryFn: async () => {
            const res = await fetch("/api/staff/my-salaries", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch salary history");
            return res.json();
        }
    });
    // 2. Fetch Payslips
    const { data: payslips = [], isLoading: isLoadingPayslips } = useQuery({
        queryKey: ["my-payslips"],
        queryFn: async () => {
            const res = await fetch("/api/staff/my-payslips", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch payslips");
            return res.json();
        }
    });
    const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];
    // Compute YTD Paid Amount
    const currentYear = new Date().getFullYear();
    const totalPaidYTD = history
        .filter(s => s.year === currentYear && s.paymentStatus === "Paid")
        .reduce((sum, s) => sum + s.netSalary, 0);
    // Compute Latest Salary Record
    const latestSalary = history[0] || null;
    // Map matching payslip for download action
    const getPayslipDownloadUrl = (salaryRecord) => {
        return `/api/payslip/download/${salaryRecord.id}`;
    };
    const { toast } = useToast();
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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Wallet className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-serif font-bold text-white tracking-wide">My Salary</h1>
                    <p className="text-muted-foreground text-xs mt-0.5">View your monthly salary disbursements, YTD earnings, and download payslips</p>
                </div>
            </div>
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Current Month Salary */}
                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-5 flex flex-col justify-between h-full min-h-[110px]">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Latest Processed Salary</p>
                            {isLoadingHistory ? (
                                <Skeleton className="h-6 w-24 mt-2 bg-white/5" />
                            ) : latestSalary ? (
                                <p className="text-lg font-bold text-white mt-1">
                                    ₹{latestSalary.netSalary.toLocaleString("en-IN")}
                                    <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                                        ({monthNames[latestSalary.month - 1]} {latestSalary.year})
                                    </span>
                                </p>
                            ) : (
                                <p className="text-sm font-semibold text-slate-500 mt-2">No records found</p>
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-3 border-t border-white/5 pt-2">
                            <span className="text-[10px] text-slate-400">Payment Status</span>
                            {latestSalary ? (
                                <Badge className={
                                    latestSalary.paymentStatus === "Paid" 
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 text-[9px]" 
                                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 text-[9px]"
                                }>
                                    {latestSalary.paymentStatus}
                                </Badge>
                            ) : (
                                <span className="text-[10px] text-slate-500">N/A</span>
                            )}
                        </div>
                    </CardContent>
                </Card>
                {/* 2. Total Paid Amount This Year */}
                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-5 flex flex-col justify-between h-full min-h-[110px]">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Paid Year-To-Date</p>
                            <p className="text-lg font-bold text-emerald-400 mt-1">₹{totalPaidYTD.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="flex items-center justify-between mt-3 border-t border-white/5 pt-2">
                            <span className="text-[10px] text-slate-400">Academic Year</span>
                            <span className="text-[10px] font-bold text-slate-300">{currentYear}</span>
                        </div>
                    </CardContent>
                </Card>
                {/* 3. Latest Payslip Download */}
                <Card className="glass-card border border-white/5 bg-[#0b0813]/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                    <CardContent className="p-5 flex flex-col justify-between h-full min-h-[110px]">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Latest Payslip Statement</p>
                            {latestSalary && latestSalary.paymentStatus === "Paid" ? (
                                <p className="text-xs font-semibold text-slate-300 mt-2 font-mono">
                                    PAY-{latestSalary.year}{String(latestSalary.month).padStart(2, '0')}-{latestSalary.id}
                                </p>
                            ) : (
                                <p className="text-xs text-slate-500 mt-2">Awaiting disbursement</p>
                            )}
                        </div>
                        <div className="mt-3 border-t border-white/5 pt-2">
                            {latestSalary && latestSalary.paymentStatus === "Paid" ? (
                                <Button 
                                    onClick={() => handleDownloadPayslip(latestSalary.id)}
                                    variant="link"
                                    className="p-0 h-auto text-purple-400 hover:text-purple-300 text-xs font-bold flex items-center justify-start gap-1"
                                >
                                     <Download className="w-3.5 h-3.5" />
                                    Download PDF Payslip
                                </Button>
                            ) : (
                                <span className="text-[10px] text-slate-500">Payslip not generated yet</span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            {/* Salary History Table */}
            <Card className="glass-card border border-white/5 bg-[#08060c]/40 overflow-hidden">
                <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-purple-400" />
                        <h2 className="font-serif text-base font-bold text-white">Disbursement Statements & History</h2>
                    </div>
                    {isLoadingHistory ? (
                        <div className="space-y-3">
                            <Skeleton className="h-6 w-full bg-white/5" />
                            <Skeleton className="h-20 w-full bg-white/5" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Landmark className="w-10 h-10 mx-auto text-purple-400 opacity-40 mb-2" />
                            <p className="font-semibold text-purple-400">No salary records generated yet</p>
                            <p className="text-xs mt-1">Your salary history will be populated here once payroll is generated by HR/Admin.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-white/4 text-slate-300 font-bold border-b border-white/5">
                                        <th className="p-3">Month / Year</th>
                                        <th className="p-3 text-right">Gross Salary</th>
                                        <th className="p-3 text-right">Deductions</th>
                                        <th className="p-3 text-right">Net Take-Home</th>
                                        <th className="p-3 text-center">Status</th>
                                        <th className="p-3 text-center">Payment Date</th>
                                        <th className="p-3 text-center">Transaction Reference</th>
                                        <th className="p-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {history.map((s) => (
                                        <tr key={s.id} className="hover:bg-white/2 transition-colors">
                                            <td className="p-3 font-semibold text-white">
                                                {monthNames[s.month - 1]} {s.year}
                                            </td>
                                            <td className="p-3 text-right text-slate-300">₹{s.grossSalary.toLocaleString("en-IN")}</td>
                                            <td className="p-3 text-right text-red-400">₹{s.totalDeduction.toLocaleString("en-IN")}</td>
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
                                            <td className="p-3 text-center text-slate-400">
                                                {s.paymentDate ? new Date(s.paymentDate).toLocaleDateString("en-IN") : "-"}
                                            </td>
                                            <td className="p-3 text-center font-mono text-slate-400">
                                                {s.transactionReference || "-"}
                                            </td>
                                            <td className="p-3 text-center">
                                                {s.paymentStatus === "Paid" ? (
                                                    <Button 
                                                        onClick={() => handleDownloadPayslip(s.id)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-purple-400 hover:text-white hover:bg-purple-500/10 text-[10px] rounded-lg flex items-center gap-1"
                                                    >
                                                         <Download className="w-3 h-3" />
                                                        Download PDF
                                                    </Button>
                                                ) : (
                                                    <span className="text-[10px] text-slate-500">Pending disburse</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Note Panel */}
            <div className="bg-[#120f1f]/60 p-4 rounded-xl border border-white/5 flex items-start gap-2.5 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-purple-300">Confidentiality & Payroll Information</p>
                    <p className="mt-0.5 leading-relaxed">
                        Your salary details are confidential. Basic salary is structured at 50% of gross, with PF contributions calculated at 12% of basic. Monthly leave deductions are computed based on recorded leaves and a standard 26-day working month. For discrepancies, please contact the Accounts or HR division.
                    </p>
                </div>
            </div>
        </div>
    );
}
