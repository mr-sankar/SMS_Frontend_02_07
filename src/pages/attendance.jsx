import { useEffect, useState } from "react";
import { useGetStudent, useGetStudentAttendanceSummary, useListAttendance, useListClasses, useMarkAttendance, useListStudents, useListStaff, getListAttendanceQueryKey, getListClassesQueryKey, getListStudentsQueryKey, getListStaffQueryKey, UserRole } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle, XCircle, Clock, AlertCircle, Plus, Grid3X3, User, BookOpen, TrendingUp, TrendingDown, Minus, Users, CalendarDays, X, Eye, LogIn, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
const statusConfig = {
    present: {
        label: "Present",
        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        bgColor: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        dotColor: "bg-emerald-400",
        icon: CheckCircle,
        quick: "P",
    },
    absent: {
        label: "Absent",
        color: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        bgColor: "bg-red-500/15 border-red-500/30 text-red-400",
        dotColor: "bg-red-400",
        icon: XCircle,
        quick: "A",
    },
    late: {
        label: "Late",
        color: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        bgColor: "bg-amber-500/15 border-amber-500/30 text-amber-400",
        dotColor: "bg-amber-400",
        icon: Clock,
        quick: "L",
    },
    half_day: {
        label: "Half Day",
        color: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
        bgColor: "bg-blue-500/15 border-blue-500/30 text-blue-400",
        dotColor: "bg-blue-400",
        icon: AlertCircle,
        quick: "H",
    },
};
const periodStatusConfig = {
    present: statusConfig.present,
    absent: statusConfig.absent,
    late: statusConfig.late,
};
const getClassLevel = (cls) => {
    const raw = String(cls?.grade ?? cls?.name ?? "");
    const match = raw.match(/\d+/);
    return match ? Number(match[0]) : null;
};
const isPeriodwiseClass = (cls) => {
    const level = getClassLevel(cls);
    return level !== null && level >= 6;
};
const getAttendanceMode = (cls) => (isPeriodwiseClass(cls) ? "periodwise" : "daily");
const BEHAVIOR_CATEGORIES = [
    { value: "bullying", label: "Bullying", type: "negative" },
    { value: "late_coming", label: "Late Coming", type: "negative" },
    { value: "uniform_violation", label: "Uniform Violation", type: "negative" },
    { value: "property_damage", label: "Property Damage", type: "negative" },
    { value: "disruptive_behavior", label: "Disruptive Behavior", type: "negative" },
    { value: "fighting", label: "Fighting", type: "negative" },
    { value: "achievement", label: "Academic Achievement", type: "positive" },
    { value: "sports_win", label: "Sports Win", type: "positive" },
    { value: "leadership", label: "Leadership", type: "positive" },
    { value: "helping_others", label: "Helping Others", type: "positive" },
    { value: "full_attendance", label: "Full Attendance", type: "positive" },
    { value: "counseling", label: "Counseling Session", type: "neutral" },
    { value: "other", label: "Other", type: "neutral" },
];
const behaviorTypeConfig = {
    positive: { color: "bg-emerald-500/10 text-emerald-400", icon: TrendingUp },
    negative: { color: "bg-red-500/10 text-red-400", icon: TrendingDown },
    neutral: { color: "bg-blue-500/10 text-blue-400", icon: Minus },
};
const summarizeAttendance = (rows = []) => {
    const counted = rows.filter((r) => r.status !== "excused");
    const present = counted.reduce((sum, r) => sum + (r.status === "present" || r.status === "late" ? 1 : r.status === "half_day" ? 0.5 : 0), 0);
    const absent = counted.length - present;
    return {
        total: counted.length,
        present,
        absent,
        percentage: counted.length > 0 ? Math.round((present / counted.length) * 100) : 0,
    };
};
const summarizeStudentDayAttendance = (rows = []) => {
    const buckets = new Map();
    const workingDays = new Set();
    rows.forEach((row) => {
        workingDays.add(String(row.date));
        const key = `${row.studentId}:${row.date}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(row);
        buckets.set(key, bucket);
    });
    let total = 0;
    let present = 0;
    let absent = 0;
    for (const bucket of buckets.values()) {
        const statuses = bucket.map((r) => r.status);
        if (statuses.every((status) => status === "excused"))
            continue;
        total += 1;
        const credit = statuses.some((status) => status === "present" || status === "late")
            ? 1
            : statuses.some((status) => status === "half_day")
                ? 0.5
                : 0;
        present += credit;
        absent += 1 - credit;
    }
    return {
        total,
        present,
        absent,
        workingDays: workingDays.size,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0,
    };
};
const getPeriodDisplayLabel = (slot, index) => `Period ${index + 1}`;
const STAFF_ATTENDANCE_ROLES = ["teacher", "accountant", "clerk", "hostel_warden", "transport_manager", "driver", "store_manager", "librarian"];
const CLASS_ATTENDANCE_ROLES = ["admin", "teacher", "clerk"];
const formatStaffTime = (value) => {
    if (!value)
        return "-";
    const raw = String(value);
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return raw.slice(0, 5);
};
const getStaffAttendanceSortTime = (record) => {
    const rawValue = record?.checkInTime ?? record?.checkOutTime ?? record?.createdAt ?? `${record?.date ?? ""}T00:00:00`;
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.getTime();
    }
    const fallback = Date.parse(`${record?.date ?? ""}T00:00:00`);
    return Number.isNaN(fallback) ? 0 : fallback;
};
const staffStatusClass = (record) => {
    if (record?.checkOutTime)
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (record?.checkInTime || record?.status === "present")
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (record?.status === "absent")
        return "bg-red-500/10 text-red-400 border-red-500/20";
    return "bg-muted text-muted-foreground";
};
const staffStatusLabel = (record) => {
    if (record?.checkOutTime)
        return "Checked Out";
    if (record?.checkInTime)
        return "Checked In";
    return record?.status ? String(record.status).replace(/_/g, " ") : "Pending";
};
export default function Attendance() {
    const { user } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const today = new Date().toISOString().split("T")[0];
    const isAdmin = user?.role === "admin";
    const isStudent = user?.role === UserRole.student;
    const isParent = user?.role === UserRole.parent;
    const isAttendanceManager = isAdmin || user?.role === "teacher" || user?.role === "clerk";
    const isTeacherOrAdmin = isAdmin || user?.role === "teacher";
    const isStaffAttendanceUser = STAFF_ATTENDANCE_ROLES.includes(user?.role || "");
    const canUsePersonalAttendance = isStudent || isParent;
    const canViewClassAttendance = CLASS_ATTENDANCE_ROLES.includes(user?.role || "");
    const [activeTab, setActiveTab] = useState(canUsePersonalAttendance ? "my-attendance" : isStaffAttendanceUser && !isAttendanceManager ? "my-staff" : "attendance");
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedDate, setSelectedDate] = useState(isAttendanceManager ? today : "");
    const [open, setOpen] = useState(false);
    const [gridMode, setGridMode] = useState(false);
    const [gridStatuses, setGridStatuses] = useState({});
    const [form, setForm] = useState({ studentId: "", classId: "", date: today, status: "present", remarks: "" });
    const [behaviorOpen, setBehaviorOpen] = useState(false);
    const [behaviorLogs, setBehaviorLogs] = useState([]);
    const [behaviorLoading, setBehaviorLoading] = useState(false);
    const [behaviorForm, setBehaviorForm] = useState({ classId: "", studentId: "", type: "negative", category: "bullying", description: "", date: today, points: "" });
    const [behaviorSubmitting, setBehaviorSubmitting] = useState(false);
    const [behaviorFilterClass, setBehaviorFilterClass] = useState("");
    const [behaviorFilterStudent, setBehaviorFilterStudent] = useState("");
    const [mode, setMode] = useState("view");
    const [bulkAttendance, setBulkAttendance] = useState({});
    const [saving, setSaving] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [attendanceMode, setAttendanceMode] = useState("manual");
    const [selectedPeriod, setSelectedPeriod] = useState("");
    const [periodEntryMode, setPeriodEntryMode] = useState("view");
    const [periodStatuses, setPeriodStatuses] = useState({});
    const [periodRemarks, setPeriodRemarks] = useState({});
    const [periodSaving, setPeriodSaving] = useState(false);
    const [staffDate, setStaffDate] = useState(today);
    const [staffMonth, setStaffMonth] = useState(today.slice(0, 7));
    const [staffDepartment, setStaffDepartment] = useState("");
    const [staffFilter, setStaffFilter] = useState("");
    const [selectedChildId, setSelectedChildId] = useState("");
    const [myDate, setMyDate] = useState(today);
    const [checkInReason, setCheckInReason] = useState("");
    const [checkOutReason, setCheckOutReason] = useState("");
    const [staffActionLoading, setStaffActionLoading] = useState(false);
    const [updatedRecords, setUpdatedRecords] = useState({});
    const { data: classes = [] } = useListClasses({ query: { queryKey: getListClassesQueryKey(), staleTime: 30000, enabled: canViewClassAttendance } });
    const periodwiseClasses = classes.filter(isPeriodwiseClass);
    const selectedClassInfo = selectedClass ? classes.find((c) => String(c.id) === selectedClass) ?? null : null;
    const selectedClassMode = selectedClassInfo ? getAttendanceMode(selectedClassInfo) : null;
    const selectedClassLabel = selectedClassInfo?.name ?? (selectedClassInfo ? `Class ${selectedClassInfo.grade}-${selectedClassInfo.section}` : "");
    const isTeacher = user?.role === "teacher";
    // Roster lookups are only needed for attendance managers (bulk entry, name lookup).
    // Student/parent receive server-scoped data and have no need for the full roster.
    const canSeeRoster = isAttendanceManager;
    const { data: allStudents = [] } = useListStudents({}, { query: { queryKey: getListStudentsQueryKey(), staleTime: 30000, enabled: canSeeRoster } });
    const { data: allStaff = [] } = useListStaff({}, { query: { queryKey: getListStaffQueryKey(), staleTime: 30000, enabled: canSeeRoster } });
    const myStaffRecord = isTeacher ? allStaff.find((s) => s.userId === user?.id || s.email === user?.email) ?? null : null;
    const handleClassChange = (value) => {
        const nextClassId = value === "all" ? "" : value;
        setSelectedClass(nextClassId);
        setMode("view");
        setGridMode(false);
        setSelectedPeriod("");
        setPeriodEntryMode("view");
        setPeriodStatuses({});
        setPeriodRemarks({});
        if (!nextClassId)
            return;
        const nextClassInfo = classes.find((c) => String(c.id) === nextClassId) ?? null;
        if (nextClassInfo) {
            setActiveTab(getAttendanceMode(nextClassInfo) === "periodwise" ? "periodwise" : "attendance");
        }
    };
    const params = {};
    if (selectedClass)
        params.classId = selectedClass;
    if (selectedDate)
        params.date = selectedDate;
    // Student/parent scoping is enforced server-side via session role â€” do NOT
    // pass studentId=user.id (user.id is the auth user id, not the student row id)
    // and do NOT pass parentId (unsupported and would 403 as out-of-scope).
    const { data: records = [], isLoading } = useListAttendance(params, { query: { queryKey: getListAttendanceQueryKey(params), staleTime: 5000, enabled: canViewClassAttendance && (activeTab === "attendance" || isAttendanceManager) } });
    useEffect(() => {
        if (!selectedClassInfo)
            return;
        if (activeTab !== "attendance" && activeTab !== "periodwise")
            return;
        const nextTab = selectedClassMode === "periodwise" ? "periodwise" : "attendance";
        if (activeTab !== nextTab) {
            setActiveTab(nextTab);
        }
        setSelectedPeriod("");
        setPeriodEntryMode("view");
        setPeriodStatuses({});
        setPeriodRemarks({});
    }, [activeTab, selectedClassInfo, selectedClassMode]);
    const dayName = selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }) : "";
    const timetableParams = new URLSearchParams();
    if (selectedClass)
        timetableParams.set("classId", selectedClass);
    const { data: timetableSlots = [] } = useQuery({
        queryKey: ["timetable", selectedClass],
        queryFn: async () => {
            const res = await fetch(`/api/timetable${timetableParams.toString() ? `?${timetableParams}` : ""}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load timetable");
            return res.json();
        },
        enabled: canViewClassAttendance && activeTab === "periodwise",
        staleTime: 30000,
    });
    const periodSlots = timetableSlots
        .filter((slot) => !selectedClass || periodwiseClasses.some((c) => String(c.id) === String(slot.classId)))
        .filter((slot) => !dayName || slot.dayOfWeek === dayName)
        .filter((slot) => !isTeacher || !myStaffRecord || String(slot.staffId) === String(myStaffRecord.id))
        .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    const teacherPeriodClassIds = new Set(timetableSlots.map((slot) => String(slot.classId)));
    const periodClassOptions = isTeacher
        ? periodwiseClasses.filter((cls) => teacherPeriodClassIds.has(String(cls.id)))
        : periodwiseClasses;
    const periodParams = new URLSearchParams();
    if (selectedClass)
        periodParams.set("classId", selectedClass);
    if (selectedDate)
        periodParams.set("date", selectedDate);
    if (selectedPeriod)
        periodParams.set("timetableSlotId", selectedPeriod);
    const { data: periodRecords = [], isLoading: periodLoading } = useQuery({
        queryKey: ["period-attendance", selectedClass, selectedDate, selectedPeriod],
        queryFn: async () => {
            const res = await fetch(`/api/attendance/period${periodParams.toString() ? `?${periodParams}` : ""}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load period attendance");
            return res.json();
        },
        enabled: canViewClassAttendance && activeTab === "periodwise",
        staleTime: 5000,
    });
    const monthlyParams = {};
    if (selectedClass)
        monthlyParams.classId = selectedClass;
    const { data: monthlyRecords = [] } = useListAttendance(monthlyParams, { query: { queryKey: getListAttendanceQueryKey(monthlyParams), staleTime: 30000, enabled: canViewClassAttendance && activeTab === "attendance" } });
    const periodDayParams = {};
    if (selectedClass)
        periodDayParams.classId = selectedClass;
    if (selectedDate)
        periodDayParams.date = selectedDate;
    const { data: periodDayRecords = [] } = useQuery({
        queryKey: ["period-attendance-day", selectedClass, selectedDate],
        queryFn: async () => {
            const res = await fetch(`/api/attendance/period${new URLSearchParams(periodDayParams).toString() ? `?${new URLSearchParams(periodDayParams)}` : ""}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load period attendance");
            return res.json();
        },
        enabled: canViewClassAttendance && activeTab === "periodwise",
        staleTime: 5000,
    });
    const periodMonthlyParams = {};
    if (selectedClass)
        periodMonthlyParams.classId = selectedClass;
    const { data: periodMonthlyRecords = [] } = useQuery({
        queryKey: ["period-attendance-month", selectedClass],
        queryFn: async () => {
            const res = await fetch(`/api/attendance/period${new URLSearchParams(periodMonthlyParams).toString() ? `?${new URLSearchParams(periodMonthlyParams)}` : ""}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load period attendance");
            return res.json();
        },
        enabled: canViewClassAttendance && activeTab === "periodwise",
        staleTime: 30000,
    });
    const staffParams = new URLSearchParams();
    if (staffDate)
        staffParams.set("date", staffDate);
    if (staffDepartment)
        staffParams.set("department", staffDepartment);
    if (staffFilter)
        staffParams.set("staffId", staffFilter);
    const { data: staffRecords = [], isLoading: staffLoading } = useQuery({
        queryKey: ["staff-attendance", staffDate, staffDepartment, staffFilter],
        queryFn: async () => {
            const res = await fetch(`/api/attendance/staff${staffParams.toString() ? `?${staffParams}` : ""}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load staff attendance");
            return res.json();
        },
        enabled: activeTab === "staff" && isAdmin,
        staleTime: 5000,
    });
    const staffCheckinRecords = [...staffRecords]
        .filter((record) => record.source === "staff_checkins")
        .sort((a, b) => {
        const aTime = getStaffAttendanceSortTime(a);
        const bTime = getStaffAttendanceSortTime(b);
        if (bTime !== aTime)
            return bTime - aTime;
        const aOut = getStaffAttendanceSortTime({ ...a, checkInTime: a.checkOutTime ?? a.checkInTime });
        const bOut = getStaffAttendanceSortTime({ ...b, checkInTime: b.checkOutTime ?? b.checkInTime });
        if (bOut !== aOut)
            return bOut - aOut;
        return String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
    useEffect(() => {
        if (isParent && !selectedChildId && user?.children?.length) {
            setSelectedChildId(String(user.children[0].id));
        }
    }, [isParent, selectedChildId, user?.children]);
    const personalStudentId = isStudent ? Number(user?.studentId ?? 0) : Number(selectedChildId || user?.children?.[0]?.id || 0);
    const { data: personalStudent } = useGetStudent(personalStudentId, {
        query: {
            enabled: canUsePersonalAttendance && personalStudentId > 0,
            staleTime: 30000,
        },
    });
    const { data: personalAttendanceSummary } = useGetStudentAttendanceSummary(personalStudentId, {
        query: {
            enabled: canUsePersonalAttendance && personalStudentId > 0,
            staleTime: 30000,
        },
    });
    const personalAttendanceMode = personalAttendanceSummary?.attendanceMode ?? "daily";
    const isPersonalPeriodwise = personalAttendanceMode === "periodwise";
    const personalDayName = myDate ? new Date(`${myDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }) : "";
    const personalClassId = personalStudent?.classId ?? 0;
    const { data: personalTimetableSlots = [] } = useQuery({
        queryKey: ["personal-timetable", personalStudentId, personalClassId],
        queryFn: async () => {
            const res = await fetch(`/api/timetable?classId=${personalClassId}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load timetable");
            return res.json();
        },
        enabled: canUsePersonalAttendance && personalStudentId > 0 && personalClassId > 0 && isPersonalPeriodwise,
        staleTime: 30000,
    });
    const { data: personalPeriodRecords = [] } = useQuery({
        queryKey: ["personal-period-attendance", personalStudentId],
        queryFn: async () => {
            const res = await fetch(`/api/attendance/period?studentId=${personalStudentId}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load period attendance");
            return res.json();
        },
        enabled: canUsePersonalAttendance && personalStudentId > 0 && isPersonalPeriodwise,
        staleTime: 15000,
    });
    const { data: personalDailyRecords = [] } = useQuery({
        queryKey: ["personal-daily-attendance", personalStudentId],
        queryFn: async () => {
            const res = await fetch(`/api/attendance?studentId=${personalStudentId}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load attendance");
            return res.json();
        },
        enabled: canUsePersonalAttendance && personalStudentId > 0 && !isPersonalPeriodwise,
        staleTime: 15000,
    });
    const { data: todayStaffAttendance, refetch: refetchTodayStaffAttendance } = useQuery({
        queryKey: ["staffTodayAttendance", user?.id, today],
        queryFn: async () => {
            const res = await fetch("/api/attendance/checkin", { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load today's staff attendance");
            return res.json();
        },
        enabled: isStaffAttendanceUser,
        staleTime: 5000,
    });
    const { data: myStaffAttendance, isLoading: myStaffLoading, refetch: refetchMyStaffAttendance } = useQuery({
        queryKey: ["my-staff-attendance", staffMonth],
        queryFn: async () => {
            const params = new URLSearchParams({ month: staffMonth });
            const res = await fetch(`/api/attendance/staff/me?${params}`, { credentials: "include" });
            if (!res.ok)
                throw new Error("Failed to load your staff attendance");
            return res.json();
        },
        enabled: isStaffAttendanceUser,
        staleTime: 5000,
    });
    const staffDepartments = Array.from(new Set(allStaff.map((staff) => String(staff.department ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const departmentStaff = staffDepartment ? allStaff.filter((staff) => String(staff.department ?? "").trim() === staffDepartment) : [];
    const invalidateAttendanceSummaries = () => qc.invalidateQueries({
        predicate: (query) => {
            const key = String(query.queryKey?.[0] ?? "");
            return key.startsWith("/api/attendance/student/") || key === "/api/dashboard/attendance-overview";
        },
    });
    const markMutation = useMarkAttendance({
        mutation: {
            onSuccess: (record) => {
                markAsUpdated(record);
                qc.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
                invalidateAttendanceSummaries();
                setOpen(false);
            },
            onError: (err) => {
                toast({ title: "Failed to mark attendance", description: err?.message ?? "Please try again.", variant: "destructive" });
            },
        },
    });
    const myStudent = isStudent ? allStudents.find((s) => s.userId === user?.id) : null;
    // Server already scopes attendance records by session role. No client-side filter needed.
    const scopedRecords = records;
    const selectedMonth = (selectedDate || today).slice(0, 7);
    const selectedDay = selectedDate || today;
    const dailySummary = summarizeStudentDayAttendance(scopedRecords.filter((r) => r.date === selectedDay));
    const monthlySummary = summarizeStudentDayAttendance(monthlyRecords.filter((r) => String(r.date).startsWith(selectedMonth)));
    const periodDailySummary = summarizeStudentDayAttendance(periodDayRecords);
    const periodMonthlySummary = summarizeStudentDayAttendance(periodMonthlyRecords.filter((r) => String(r.date).startsWith(selectedMonth)));
    const classStudents = selectedClass
        ? allStudents.filter(s => String(s.classId) === selectedClass)
        : [];
    const behaviorClassStudents = behaviorForm.classId
        ? allStudents.filter((s) => String(s.classId) === behaviorForm.classId)
        : [];
    const behaviorFilterStudents = behaviorFilterClass
        ? allStudents.filter((s) => String(s.classId) === behaviorFilterClass)
        : [];
    const behaviorStudentMap = new Map(allStudents.map((student) => [Number(student.id), student]));
    const behaviorClassMap = Object.fromEntries(classes.map((cls) => [String(cls.id), cls.name ?? `Class ${cls.id}`]));
    const getBehaviorLogClassLabel = (log) => {
        if (log.className)
            return log.className;
        const storedClassId = log.classId ? String(log.classId) : "";
        if (storedClassId && behaviorClassMap[storedClassId]) {
            return behaviorClassMap[storedClassId];
        }
        const student = behaviorStudentMap.get(Number(log.studentId));
        if (student?.className)
            return student.className;
        if (student?.classId)
            return behaviorClassMap[String(student.classId)] ?? `Class ${student.classId}`;
        if (behaviorFilterClass)
            return behaviorClassMap[behaviorFilterClass] ?? `Class ${behaviorFilterClass}`;
        return null;
    };
    const displayedBehaviorLogs = behaviorLogs;
    const periodwiseClassStudents = selectedClass && periodwiseClasses.some((c) => String(c.id) === selectedClass)
        ? classStudents
        : [];
    void isParent;
    void myStudent;
    const canUseDailyAttendance = !selectedClassMode || selectedClassMode === "daily";
    const canUsePeriodAttendance = !selectedClassMode || selectedClassMode === "periodwise";
    const selectedSlot = periodSlots.find((slot) => String(slot.id) === selectedPeriod);
    const periodExistingByStudent = {};
    for (const r of periodRecords) {
        if (!selectedPeriod || String(r.timetableSlotId) === selectedPeriod)
            periodExistingByStudent[r.studentId] = r;
    }
    const existingByStudent = {};
    for (const r of records) {
        existingByStudent[r.studentId] = r.status;
    }
    const markAsUpdated = (record) => {
        if (!record?.wasUpdated)
            return;
        const key = `${record.studentId}:${record.classId}:${record.date}:${record.timetableSlotId ?? "daily"}`;
        setUpdatedRecords((prev) => ({ ...prev, [key]: true }));
    };
    const handleGridSubmit = async () => {
        for (const [studentIdStr, status] of Object.entries(gridStatuses)) {
            const studentId = parseInt(studentIdStr);
            const record = await markMutation.mutateAsync({
                data: { studentId, classId: parseInt(selectedClass), date: selectedDate, status },
            });
            markAsUpdated(record);
        }
        qc.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
        invalidateAttendanceSummaries();
        setGridStatuses({});
    };
    const cycleStatus = (studentId) => {
        const order = ["present", "absent", "late", "half_day"];
        const current = gridStatuses[studentId] ?? (existingByStudent[studentId] ?? "present");
        const next = order[(order.indexOf(current) + 1) % order.length];
        setGridStatuses((prev) => ({ ...prev, [studentId]: next }));
    };
    const loadBehaviorLogs = async ({ classId, studentId } = {}) => {
        setBehaviorLoading(true);
        try {
            const params = new URLSearchParams();
            if (classId)
                params.set("classId", classId);
            if (studentId)
                params.set("studentId", studentId);
            const url = params.toString() ? `/api/behavior-logs?${params.toString()}` : "/api/behavior-logs";
            const res = await fetch(url, { credentials: "include" });
            if (res.ok)
                setBehaviorLogs(await res.json());
        }
        catch { }
        setBehaviorLoading(false);
    };
    const handleBehaviorTabClick = () => {
        setActiveTab("behavior");
        loadBehaviorLogs({ classId: behaviorFilterClass || undefined, studentId: behaviorFilterStudent || undefined });
    };
    const handleBehaviorClassChange = (classId) => {
        setBehaviorForm((f) => ({ ...f, classId, studentId: "" }));
    };
    const handleBehaviorFilterClassChange = (value) => {
        const classId = value === "all" ? "" : value;
        setBehaviorFilterClass(classId);
        setBehaviorFilterStudent("");
        loadBehaviorLogs({ classId: classId || undefined });
    };
    const handleBehaviorFilterStudentChange = (value) => {
        const studentId = value === "all" ? "" : value;
        setBehaviorFilterStudent(studentId);
        loadBehaviorLogs({ classId: behaviorFilterClass || undefined, studentId: studentId || undefined });
    };
    const handleAttendanceTabClick = () => {
        if (selectedClassMode === "periodwise") {
            setSelectedClass("");
            setSelectedPeriod("");
            setPeriodStatuses({});
            setPeriodRemarks({});
        }
        setActiveTab("attendance");
    };
    const handleStaffCheckIn = async () => {
        setStaffActionLoading(true);
        try {
            const res = await fetch("/api/attendance/checkin", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: checkInReason.trim() || undefined }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Check-in failed", description: payload?.error || "Please try again.", variant: "destructive" });
                return;
            }
            setCheckInReason("");
            toast({ title: "Check-in saved", description: "Your staff attendance was saved to the database." });
            refetchTodayStaffAttendance();
            refetchMyStaffAttendance();
            qc.invalidateQueries({ queryKey: ["staff-attendance"] });
        }
        catch {
            toast({ title: "Check-in failed", description: "Please try again.", variant: "destructive" });
        }
        finally {
            setStaffActionLoading(false);
        }
    };
    const handleStaffCheckOut = async () => {
        if (!checkOutReason.trim()) {
            toast({ title: "Checkout reason required", description: "Please enter a reason for early checkout.", variant: "destructive" });
            return;
        }
        setStaffActionLoading(true);
        try {
            const res = await fetch("/api/attendance/checkout", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: checkOutReason.trim() || undefined }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ title: "Checkout failed", description: payload?.error || "Please try again.", variant: "destructive" });
                return;
            }
            setCheckOutReason("");
            toast({ title: "Checkout saved", description: "Your staff attendance record was updated." });
            refetchTodayStaffAttendance();
            refetchMyStaffAttendance();
            qc.invalidateQueries({ queryKey: ["staff-attendance"] });
        }
        catch {
            toast({ title: "Checkout failed", description: "Please try again.", variant: "destructive" });
        }
        finally {
            setStaffActionLoading(false);
        }
    };
    const handleBehaviorSubmit = async () => {
        if (!behaviorForm.classId || !behaviorForm.studentId || !behaviorForm.description || !behaviorForm.date)
            return;
        setBehaviorSubmitting(true);
        try {
            const res = await fetch("/api/behavior-logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentId: parseInt(behaviorForm.studentId),
                    classId: behaviorForm.classId ? parseInt(behaviorForm.classId) : undefined,
                    type: behaviorForm.type,
                    category: behaviorForm.category,
                    description: behaviorForm.description,
                    date: behaviorForm.date,
                    points: behaviorForm.points ? parseInt(behaviorForm.points) : (behaviorForm.type === "positive" ? 5 : -5),
                }),
            });
            if (res.ok) {
                toast({ title: "Behavior log added successfully" });
                setBehaviorOpen(false);
                setBehaviorForm({ classId: "", studentId: "", type: "negative", category: "bullying", description: "", date: today, points: "" });
                loadBehaviorLogs({ classId: behaviorFilterClass || undefined, studentId: behaviorFilterStudent || undefined });
            }
            else {
                toast({ title: "Failed to add log", variant: "destructive" });
            }
        }
        catch {
            toast({ title: "Failed to add log", variant: "destructive" });
        }
        setBehaviorSubmitting(false);
    };
    const filteredCategories = BEHAVIOR_CATEGORIES.filter((c) => behaviorForm.type === "neutral" || c.type === behaviorForm.type || c.type === "neutral");
    const initBulkAttendance = () => {
        const initial = {};
        classStudents.forEach(s => { initial[s.id] = existingByStudent[s.id] ?? "present"; });
        setBulkAttendance(initial);
        setMode("bulk");
    };
    const toggleStatus = (studentId) => {
        setBulkAttendance(prev => ({
            ...prev,
            [studentId]: prev[studentId] === "present" ? "absent" : "present",
        }));
    };
    const setStatus = (studentId, status) => {
        setBulkAttendance(prev => ({ ...prev, [studentId]: status }));
    };
    const saveBulkAttendance = async () => {
        if (!selectedClass || Object.keys(bulkAttendance).length === 0)
            return;
        setSaving(true);
        try {
            let createdCount = 0;
            let updatedCount = 0;
            for (const [studentIdStr, status] of Object.entries(bulkAttendance)) {
                const record = await markMutation.mutateAsync({
                    data: {
                        studentId: parseInt(studentIdStr),
                        classId: parseInt(selectedClass),
                        date: selectedDate,
                        status: status,
                    }
                });
                if (record?.wasUpdated)
                    updatedCount += 1;
                else
                    createdCount += 1;
            }
            toast({ title: "Attendance updated", description: `${createdCount} new, ${updatedCount} corrected. No duplicate records saved.` });
            setMode("view");
            qc.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
            invalidateAttendanceSummaries();
        }
        catch {
            toast({ title: "Error saving attendance", variant: "destructive" });
        }
        setSaving(false);
    };
    const savePeriodAttendance = async () => {
        if (!selectedClass || !selectedPeriod || Object.keys(periodStatuses).length === 0)
            return;
        setPeriodSaving(true);
        try {
            let createdCount = 0;
            let updatedCount = 0;
            for (const [studentIdStr, status] of Object.entries(periodStatuses)) {
                const res = await fetch("/api/attendance/period", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studentId: Number(studentIdStr),
                        classId: Number(selectedClass),
                        timetableSlotId: Number(selectedPeriod),
                        date: selectedDate,
                        status,
                    remarks: periodRemarks[studentIdStr] || undefined,
                    }),
                });
                if (!res.ok) {
                    let message = "Failed to save period attendance";
                    try {
                        const payload = await res.json();
                        message = payload?.error || payload?.details || message;
                    }
                    catch {
                        const text = await res.text().catch(() => "");
                        if (text)
                            message = text;
                    }
                    throw new Error(message);
                }
                const record = await res.json();
                if (record?.wasUpdated)
                    updatedCount += 1;
                else
                    createdCount += 1;
                markAsUpdated(record);
            }
            toast({ title: "Period attendance updated", description: `${createdCount} new, ${updatedCount} corrected. No duplicate records saved.` });
            setPeriodEntryMode("view");
            setPeriodStatuses({});
            setPeriodRemarks({});
            qc.invalidateQueries({ queryKey: ["period-attendance"] });
            qc.invalidateQueries({ queryKey: ["period-attendance-day"] });
            qc.invalidateQueries({ queryKey: ["period-attendance-month"] });
            qc.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
            invalidateAttendanceSummaries();
        }
        catch (err) {
            toast({ title: "Error saving period attendance", description: err?.message ?? "Please try again.", variant: "destructive" });
        }
        setPeriodSaving(false);
    };
    const presentCount = Object.values(bulkAttendance).filter(s => s === "present").length;
    const absentCount = Object.values(bulkAttendance).filter(s => s === "absent").length;
    const myStaffSummary = myStaffAttendance?.summary ?? { total: 0, present: 0, absent: 0, percentage: 0 };
    const myStaffRecords = myStaffAttendance?.records ?? [];
    const isStaffCheckedIn = !!todayStaffAttendance?.checkInTime;
    const isStaffCheckedOut = !!todayStaffAttendance?.checkOutTime;
    const personalRecords = isPersonalPeriodwise ? personalPeriodRecords : personalDailyRecords;
    const personalSelectedMonth = myDate.slice(0, 7);
    const personalDateLabel = myDate ? new Date(`${myDate}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
    }) : "";
    const personalMonthLabel = myDate ? new Date(`${myDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
    }) : personalSelectedMonth;
    const personalSelectedDayRecords = personalRecords.filter((record) => String(record.date) === myDate);
    const personalSelectedMonthRecords = personalRecords.filter((record) => String(record.date).startsWith(personalSelectedMonth));
    const personalSelectedDaySummary = summarizeAttendance(personalSelectedDayRecords);
    const personalSelectedMonthSummary = summarizeAttendance(personalSelectedMonthRecords);
    const personalAllTimeSummary = summarizeAttendance(personalRecords);
    const personalAttendanceUnitLabel = isPersonalPeriodwise ? "Periods" : "Days";
    const personalTimetableBySlotId = Object.fromEntries(personalTimetableSlots.map((slot) => [String(slot.id), slot]));
    const personalSelectedDaySchedule = isPersonalPeriodwise
        ? personalTimetableSlots
            .filter((slot) => !personalDayName || slot.dayOfWeek === personalDayName)
            .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
            .map((slot) => ({
            slot,
            record: personalPeriodRecords.find((record) => String(record.date) === myDate && String(record.timetableSlotId) === String(slot.id)) ?? null,
        }))
        : [];
    const personalHistory = isPersonalPeriodwise
        ? [...personalPeriodRecords].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(personalTimetableBySlotId[String(a.timetableSlotId)]?.startTime ?? "").localeCompare(String(personalTimetableBySlotId[String(b.timetableSlotId)]?.startTime ?? "")))
        : [...personalDailyRecords].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const personalAttendanceLabel = isPersonalPeriodwise ? "Period attendance" : "Attendance";
    const personalHeaderSubtitle = activeTab === "my-attendance"
        ? isParent
            ? personalStudent
                ? `${personalStudent.name}'s timetable-based attendance records`
                : "Select a child to view timetable-based attendance"
            : "Your timetable-based attendance records"
        : activeTab === "my-staff"
            ? "Your staff attendance percentage and saved check-ins"
            : isStudent
                ? "Your personal attendance record"
                : isParent
                    ? "Your child's attendance"
                    : "Track attendance and student behavior";
    return (<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-cyan-400">Attendance &amp; Behavior</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {personalHeaderSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isTeacher && activeTab === "attendance" && mode === "view" && (<>
              <Button variant="outline" className="gap-2" onClick={() => setGridMode((g) => !g)}>
                <Grid3X3 className="w-4 h-4"/>
                {gridMode ? "List View" : "Grid Mark"}
              </Button>
              <Button className="gap-2" onClick={() => {
                if (!selectedClass) {
                    toast({ title: "Select a class first" });
                    return;
                }
                initBulkAttendance();
            }}>
                <Users className="w-4 h-4"/>
                Bulk Attendance
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="w-4 h-4"/>
                    Mark Single
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <Label>Student *</Label>
                      <Select value={form.studentId} onValueChange={(v) => setForm((f) => ({ ...f, studentId: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select student"/></SelectTrigger>
                        <SelectContent>
                          {allStudents.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name} â€” {s.className}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Class *</Label>
                      <Select value={form.classId} onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select class"/></SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Date *</Label>
                        <Input type="date" className="mt-1" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}/>
                      </div>
                      <div>
                        <Label>Status *</Label>
                        <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Remarks</Label>
                      <Input className="mt-1" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Optional note"/>
                    </div>
                    <Button className="w-full" disabled={!form.studentId || !form.classId || markMutation.isPending} onClick={() => markMutation.mutate({
                data: {
                    studentId: parseInt(form.studentId),
                    classId: parseInt(form.classId),
                    date: form.date,
                    status: form.status,
                    remarks: form.remarks || undefined,
                },
            })}>
                      {markMutation.isPending ? "Savingâ€¦" : "Save Attendance"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>)}

          {isTeacherOrAdmin && activeTab === "behavior" && (<Dialog open={behaviorOpen} onOpenChange={setBehaviorOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4"/>
                  Log Behavior
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Log Student Behavior</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Class *</Label>
                    <Select value={behaviorForm.classId} onValueChange={handleBehaviorClassChange}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select class"/></SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Student *</Label>
                    <Select value={behaviorForm.studentId} onValueChange={(v) => setBehaviorForm((f) => ({ ...f, studentId: v }))} disabled={!behaviorForm.classId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={behaviorForm.classId ? "Select student" : "Select class first"}/></SelectTrigger>
                      <SelectContent>
                        {behaviorClassStudents.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {behaviorForm.classId && behaviorClassStudents.length === 0 && (<p className="text-xs text-muted-foreground mt-1">No students found in this class.</p>)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {["positive", "negative", "neutral"].map((t) => (<button key={t} onClick={() => setBehaviorForm((f) => ({ ...f, type: t }))} className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-colors ${behaviorForm.type === t ? behaviorTypeConfig[t].color + " border-current/30" : "border-border text-muted-foreground hover:bg-accent/20"}`}>
                        {t}
                      </button>))}
                  </div>
                  <div>
                    <Label>Category *</Label>
                    <Select value={behaviorForm.category} onValueChange={(v) => setBehaviorForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {filteredCategories.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Textarea className="mt-1 resize-none" rows={3} value={behaviorForm.description} onChange={(e) => setBehaviorForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe what happenedâ€¦"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Date *</Label>
                      <Input type="date" className="mt-1" value={behaviorForm.date} onChange={(e) => setBehaviorForm((f) => ({ ...f, date: e.target.value }))}/>
                    </div>
                    <div>
                      <Label>Points</Label>
                      <Input type="number" className="mt-1" value={behaviorForm.points} onChange={(e) => setBehaviorForm((f) => ({ ...f, points: e.target.value }))} placeholder={behaviorForm.type === "positive" ? "+5" : "-5"}/>
                    </div>
                  </div>
                  <Button className="w-full" disabled={!behaviorForm.studentId || !behaviorForm.description || behaviorSubmitting} onClick={handleBehaviorSubmit}>
                    {behaviorSubmitting ? "Savingâ€¦" : "Save Behavior Log"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>)}

          {isTeacherOrAdmin && mode === "bulk" && (<>
              <Button variant="outline" onClick={() => setMode("view")}>Cancel</Button>
              <Button onClick={saveBulkAttendance} disabled={saving}>
                {saving ? "Saving..." : `Save (${presentCount}P / ${absentCount}A)`}
              </Button>
            </>)}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {canUsePersonalAttendance && (<Button variant={activeTab === "my-attendance" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("my-attendance")} className="gap-2">
          <User className="w-4 h-4"/> My Attendance
        </Button>)}
        {isStaffAttendanceUser && (<Button variant={activeTab === "my-staff" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("my-staff")} className="gap-2">
          <User className="w-4 h-4"/> My Staff Attendance
        </Button>)}
        {canViewClassAttendance && (<Button variant={activeTab === "attendance" ? "default" : "outline"} size="sm" onClick={handleAttendanceTabClick} className="gap-2">
          <CheckCircle className="w-4 h-4"/> Attendance
        </Button>)}
        {canViewClassAttendance && (<Button variant={activeTab === "periodwise" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("periodwise")} className="gap-2" disabled={!canUsePeriodAttendance}>
          <Clock className="w-4 h-4"/> Periodwise
        </Button>)}
        {isAdmin && (<Button variant={activeTab === "staff" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("staff")} className="gap-2">
            <Users className="w-4 h-4"/> Staff
        </Button>)}
        {isTeacherOrAdmin && (<Button variant={activeTab === "behavior" ? "default" : "outline"} size="sm" onClick={handleBehaviorTabClick} className="gap-2">
            <BookOpen className="w-4 h-4"/> Behavior Log
          </Button>)}
      </div>

      {/* â”€â”€â”€ ATTENDANCE TAB â”€â”€â”€ */}
      {activeTab === "my-attendance" && canUsePersonalAttendance && (personalStudentId > 0 ? (<div className="space-y-4">
          <Card className="glass-card border-t-2 border-t-cyan-400/30">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">My Attendance</p>
                    <Badge className={isPersonalPeriodwise ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}>
                      {personalAttendanceLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {personalStudent?.name || user?.name || "Student"} · {personalStudent?.rollNumber || "—"} · {personalStudent?.className || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Attendance follows the timetable for {personalMonthLabel}.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  {isParent && (user?.children?.length ?? 0) > 1 && (
                    <div className="space-y-1">
                      <Label>Select child</Label>
                      <Select value={selectedChildId || String(user?.children?.[0]?.id ?? "")} onValueChange={setSelectedChildId}>
                        <SelectTrigger className="sm:w-56">
                          <SelectValue placeholder="Choose child" />
                        </SelectTrigger>
                        <SelectContent>
                          {user?.children?.map((child) => (<SelectItem key={child.id} value={String(child.id)}>{child.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>Select date</Label>
                    <Input type="date" value={myDate} onChange={(e) => setMyDate(e.target.value || today)} className="sm:w-48"/>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected Day</p>
                <p className={`text-3xl font-bold mt-1 ${personalSelectedDaySummary.percentage < 75 && personalSelectedDaySummary.total > 0 ? "text-red-400" : "text-cyan-400"}`}>{personalSelectedDaySummary.percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">{personalDateLabel || myDate} · {personalSelectedDaySummary.total} {personalAttendanceUnitLabel.toLowerCase()}</p>
              </CardContent>
            </Card>
            <Card className="border border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">This Month</p>
                <p className={`text-3xl font-bold mt-1 ${personalSelectedMonthSummary.percentage < 75 && personalSelectedMonthSummary.total > 0 ? "text-red-400" : "text-emerald-400"}`}>{personalSelectedMonthSummary.percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">{personalMonthLabel} · {personalSelectedMonthSummary.total} {personalAttendanceUnitLabel.toLowerCase()}</p>
              </CardContent>
            </Card>
            <Card className="border border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">All Time</p>
                <p className={`text-3xl font-bold mt-1 ${personalAllTimeSummary.percentage < 75 && personalAllTimeSummary.total > 0 ? "text-red-400" : "text-blue-400"}`}>{personalAllTimeSummary.percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">{personalAllTimeSummary.total} total {personalAttendanceUnitLabel.toLowerCase()}</p>
              </CardContent>
            </Card>
          </div>

          {isPersonalPeriodwise ? (
            <Card className="glass-card border-t-2 border-t-blue-400/30">
              <CardHeader>
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <Clock className="w-4 h-4"/> Timetable for {personalDateLabel || myDate}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {personalSelectedDaySchedule.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-card/40 p-4 text-sm text-muted-foreground">No timetable slots found for this day yet.</div>
                ) : (
                  <div className="space-y-2">
                    {personalSelectedDaySchedule.map(({ slot, record }) => (
                      <div key={slot.id} className="rounded-lg border border-border/50 bg-card/40 p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{slot.subjectName || "Subject"}</p>
                            <p className="text-xs text-muted-foreground">{slot.teacherName || "Teacher"} · {slot.startTime} - {slot.endTime}{slot.room ? ` · Room ${slot.room}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{slot.dayOfWeek}</Badge>
                            <Badge className={record ? statusConfig[record.status]?.color ?? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"}>
                              {record ? statusConfig[record.status]?.label ?? record.status : "Not marked"}
                            </Badge>
                          </div>
                        </div>
                        {record && <p className="mt-2 text-xs text-muted-foreground">{record.date}{record.remarks ? ` · ${record.remarks}` : ""}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card border-t-2 border-t-blue-400/30">
              <CardHeader>
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <CalendarDays className="w-4 h-4"/> Selected Day - {personalDateLabel || myDate}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-xs text-muted-foreground">Attendance rate</p>
                    <p className={`text-2xl font-bold ${personalSelectedDaySummary.percentage < 75 && personalSelectedDaySummary.total > 0 ? "text-red-400" : "text-cyan-400"}`}>{personalSelectedDaySummary.percentage}%</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-xs text-muted-foreground">Recorded entries</p>
                    <p className="text-2xl font-bold text-emerald-400">{personalSelectedDaySummary.total}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                  <p className="text-sm font-medium">Latest entry</p>
                  {personalSelectedDayRecords.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">No attendance records found for this date yet.</p>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">{personalSelectedDayRecords[0].remarks || "Daily attendance recorded"}</p>
                      <Badge className={statusConfig[personalSelectedDayRecords[0].status]?.color ?? "bg-muted text-muted-foreground"}>
                        {statusConfig[personalSelectedDayRecords[0].status]?.label ?? personalSelectedDayRecords[0].status}
                      </Badge>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">The full attendance history is listed below.</p>
              </CardContent>
            </Card>
          )}

          <Card className="glass-card border-t-2 border-t-cyan-400/30">
            <CardHeader>
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <CalendarDays className="w-4 h-4"/> Attendance History - {personalHistory.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {personalHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No attendance records found yet.</div>
              ) : (
                <div className="space-y-2">
                  {personalHistory.map((record) => (
                    <div key={`${record.id}-${record.date}`} className="rounded-lg border border-border/50 p-3 hover:bg-cyan-500/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{record.date}{record.className ? ` · ${record.className}` : ""}</p>
                          <p className="text-xs text-muted-foreground">
                            {record.subjectName ? `${record.subjectName} · ` : ""}{record.teacherName || "Teacher"}{record.periodLabel ? ` · ${record.periodLabel}` : ""}
                          </p>
                        </div>
                        <Badge className={statusConfig[record.status]?.color ?? "bg-muted text-muted-foreground"}>{statusConfig[record.status]?.label ?? record.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>) : (
          <Card className="glass-card border-t-2 border-t-cyan-400/30">
            <CardContent className="p-6 text-center text-muted-foreground">
              {isParent ? "No linked child was found for this parent account yet." : "No linked student profile was found for this account yet."}
            </CardContent>
          </Card>
        ))}

      {activeTab === "my-staff" && isStaffAttendanceUser && (<>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">My Staff Attendance</p>
              <p className="text-xs text-muted-foreground">{myStaffAttendance?.staff?.name || user?.name || "Staff"} - {staffMonth}</p>
            </div>
            <Input type="month" value={staffMonth} onChange={(e) => setStaffMonth(e.target.value || today.slice(0, 7))} className="sm:w-48"/>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="border border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Attendance Rate</p>
                <p className={`text-3xl font-bold mt-1 ${myStaffSummary.percentage < 75 && myStaffSummary.total > 0 ? "text-red-400" : "text-cyan-400"}`}>{myStaffSummary.percentage}%</p>
              </CardContent>
            </Card>
            <Card className="border border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Present</p>
                <p className="text-3xl font-bold mt-1 text-emerald-400">{myStaffSummary.present}</p>
              </CardContent>
            </Card>
            <Card className="border border-red-500/20 bg-red-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Absent</p>
                <p className="text-3xl font-bold mt-1 text-red-400">{myStaffSummary.absent}</p>
              </CardContent>
            </Card>
            <Card className="border border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Saved Days</p>
                <p className="text-3xl font-bold mt-1 text-blue-400">{myStaffSummary.total}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card border-t-2 border-t-emerald-400/40">
            <CardHeader>
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <Clock className="w-4 h-4"/> Today's Check-in
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isStaffCheckedIn ? (<div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <Label>Check-in note</Label>
                    <Textarea value={checkInReason} onChange={(e) => setCheckInReason(e.target.value)} placeholder="Optional note" rows={2}/>
                  </div>
                  <Button onClick={handleStaffCheckIn} disabled={staffActionLoading} className="gap-2">
                    <LogIn className="w-4 h-4"/>
                    {staffActionLoading ? "Saving..." : "Check In"}
                  </Button>
                </div>) : (<div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-xs text-muted-foreground">Checked in</p>
                    <p className="font-semibold text-emerald-400">{formatStaffTime(todayStaffAttendance.checkInTime)}</p>
                    {todayStaffAttendance.checkInReason && <p className="text-xs text-muted-foreground mt-1">{todayStaffAttendance.checkInReason}</p>}
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-xs text-muted-foreground">Checked out</p>
                    <p className="font-semibold text-blue-400">{formatStaffTime(todayStaffAttendance.checkOutTime)}</p>
                  </div>
                </div>)}

              {isStaffCheckedIn && !isStaffCheckedOut && (<div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <Label>Early checkout reason</Label>
                    <Textarea value={checkOutReason} onChange={(e) => setCheckOutReason(e.target.value)} placeholder="Reason required" rows={2}/>
                  </div>
                  <Button variant="outline" onClick={handleStaffCheckOut} disabled={staffActionLoading || !checkOutReason.trim()} className="gap-2">
                    <LogOut className="w-4 h-4"/>
                    {staffActionLoading ? "Saving..." : "Check Out"}
                  </Button>
                </div>)}
            </CardContent>
          </Card>

          <Card className="glass-card border-t-2 border-t-cyan-500/30">
            <CardHeader><CardTitle className="text-base font-serif">My Attendance Records - {myStaffRecords.length}</CardTitle></CardHeader>
            <CardContent>
              {myStaffLoading ? (<div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full"/>))}</div>) : myStaffRecords.length === 0 ? (<div className="text-center py-12 text-muted-foreground">No staff attendance records saved for this month.</div>) : (<div className="space-y-2">
                  {myStaffRecords.map((record) => (<div key={`${record.source ?? "staff"}-${record.date}-${record.id}`} className="rounded-lg border border-border/50 p-3 hover:bg-cyan-500/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{record.date}</p>
                          <p className="text-xs text-muted-foreground">
                            In {formatStaffTime(record.checkInTime)} - Out {formatStaffTime(record.checkOutTime)}
                          </p>
                        </div>
                        <Badge className={staffStatusClass(record)}>{staffStatusLabel(record)}</Badge>
                      </div>
                    </div>))}
                </div>)}
            </CardContent>
          </Card>
        </>)}

      {activeTab === "attendance" && (<>
          {/* Student summary banner */}
          {isStudent && myStudent && (<Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-full bg-cyan-500/10">
                  <User className="w-5 h-5 text-cyan-400"/>
                </div>
                <div>
                  <p className="font-medium">{myStudent.name}</p>
                  <p className="text-sm text-muted-foreground">{myStudent.rollNumber} Â· {myStudent.className}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-cyan-400">
                    {scopedRecords.length > 0 ? Math.round((scopedRecords.filter((r) => r.status === "present").length / scopedRecords.length) * 100) : "-"}
                    {scopedRecords.length > 0 ? "%" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Attendance rate</p>
                </div>
              </CardContent>
            </Card>)}

          {/* Filters */}
              {mode === "view" && (<div className="flex flex-col sm:flex-row gap-3">
                {!isStudent && (<Select value={selectedClass || "all"} onValueChange={handleClassChange}>
                    <SelectTrigger className="sm:w-48"><SelectValue placeholder="All classes"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {classes.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                    </SelectContent>
                </Select>)}
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="sm:w-48"/>
              {isTeacherOrAdmin && (
                <Select value={attendanceMode} onValueChange={setAttendanceMode}>
                  <SelectTrigger className="sm:w-48"><SelectValue placeholder="Input Mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Input</SelectItem>
                    <SelectItem value="rfid">RFID Scanner Mode</SelectItem>
                    <SelectItem value="biometric">Biometric Device Mode</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={() => { setSelectedClass(""); setSelectedDate(isAttendanceManager ? today : ""); setAttendanceMode("manual"); setMode("view"); }}>Reset</Button>
              </div>)}

            {selectedClass && selectedClassInfo && (<Card className={selectedClassMode === "periodwise" ? "border-blue-500/20 bg-blue-500/5 mt-3" : "border-cyan-500/20 bg-cyan-500/5 mt-3"}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{selectedClassLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedClassMode === "periodwise"
                        ? "Classes 6+ use periodwise attendance. Daily attendance is calculated from period records."
                        : "Classes 1-5 use direct daily attendance."}
                    </p>
                    {selectedClassMode === "periodwise" && (
                      <p className="mt-1 text-xs text-blue-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        This class automatically opens Periodwise Attendance for attendance managers.
                      </p>
                    )}
                  </div>
                  <Badge className={selectedClassMode === "periodwise" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}>
                    {selectedClassMode === "periodwise" ? "Periodwise" : "Daily"}
                  </Badge>
                </CardContent>
              </Card>)}

          {isTeacher && attendanceMode !== "manual" && (
              <div className={`p-4 rounded-lg border flex items-center justify-between animate-in fade-in duration-300 mt-3 ${attendanceMode === "rfid" ? "bg-cyan-500/10 border-cyan-500/25 text-cyan-400" : "bg-purple-500/10 border-purple-500/25 text-purple-400"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full animate-ping ${attendanceMode === "rfid" ? "bg-cyan-400" : "bg-purple-400"}`} />
                <div className="text-xs">
                  <p className="font-semibold">{attendanceMode === "rfid" ? "RFID Integration Active" : "Biometric Device Sync Active"}</p>
                  <p className="opacity-80">{attendanceMode === "rfid" ? "Listening for RFID badge scans at local terminals..." : "Fetching fingerprint/facial recognition records from access gates..."}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7 border-current/20 hover:bg-white/5" onClick={() => {
                toast({ title: attendanceMode === "rfid" ? "RFID Badge Detected" : "Biometric Match Confirmed", description: "Successfully synced latest entry records to attendance log." });
              }}>Simulate Scan</Button>
            </div>
          )}

          {/* Grid marking mode */}
          {gridMode && isTeacher && selectedClass && mode === "view" && (<Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4 text-primary"/>
                  Grid Marking â€” {selectedDate} â€” Click to cycle P/A/L/E
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {classStudents.length === 0 ? (<p className="text-sm text-muted-foreground">No students in this class.</p>) : (<>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {classStudents.map((student) => {
                        const currentStatus = gridStatuses[student.id] ?? existingByStudent[student.id] ?? "present";
                        const cfg = statusConfig[currentStatus];
                        return (<button key={student.id} onClick={() => cycleStatus(student.id)} className={`p-3 rounded-lg border text-left transition-all hover:opacity-90 ${cfg.color} border-current/20`}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium text-xs truncate">{student.name}</p>
                              <span className="font-bold text-xs">{cfg.quick}</span>
                            </div>
                            <p className="text-xs opacity-70">{student.rollNumber}</p>
                          </button>);
                    })}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {Object.entries(statusConfig).map(([k, v]) => (<span key={k} className={`px-2 py-1 rounded ${v.color}`}>{v.quick} = {v.label}</span>))}
                      </div>
                      <Button className="ml-auto" size="sm" disabled={Object.keys(gridStatuses).length === 0 || markMutation.isPending} onClick={handleGridSubmit}>
                        {markMutation.isPending ? "Saving..." : `Submit ${Object.keys(gridStatuses).length} Records`}
                      </Button>
                    </div>
                  </>)}
              </CardContent>
            </Card>)}

          {/* Bulk marking grid */}
          {mode === "bulk" && isTeacher && classStudents.length > 0 && (<Card className="border-orange-500/20 bg-orange-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-orange-400"/>
                    Marking â€” {classes.find(c => String(c.id) === selectedClass)?.name} Â· {selectedDate}
                  </CardTitle>
                  <div className="flex gap-3 text-sm">
                    <span className="text-emerald-400 font-medium">{presentCount}P</span>
                    <span className="text-red-400 font-medium">{absentCount}A</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs" onClick={() => { const all = {}; classStudents.forEach(s => { all[s.id] = "present"; }); setBulkAttendance(all); }}>All Present</Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-500/30 text-xs" onClick={() => { const all = {}; classStudents.forEach(s => { all[s.id] = "absent"; }); setBulkAttendance(all); }}>All Absent</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {classStudents.map(student => {
                    const status = bulkAttendance[student.id] ?? "present";
                    const cfg = statusConfig[status] ?? statusConfig.present;
                    return (<div key={student.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${cfg.bgColor}`} onClick={() => toggleStatus(student.id)}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={student.avatarUrl} />
                          <AvatarFallback className="text-xs bg-muted">{student.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.rollNumber}</p>
                        </div>
                        <Select value={status} onValueChange={v => setStatus(student.id, v)}>
                          <SelectTrigger className="w-24 h-7 text-xs border-0 bg-transparent p-1" onClick={e => e.stopPropagation()}>
                            <div className={`w-2 h-2 rounded-full ${cfg.dotColor} mr-1.5`}/>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([k, v]) => (<SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>);
                })}
                </div>
              </CardContent>
            </Card>)}

          {mode === "bulk" && isTeacher && selectedClass && classStudents.length === 0 && (<Card className="glass-card border-t-2 border-t-cyan-500/30"><CardContent className="py-8 text-center text-muted-foreground">No students found in this class.</CardContent></Card>)}

          {mode === "view" && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border border-cyan-500/20 bg-cyan-500/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Daily Percentage</p>
                      <p className="text-xs text-muted-foreground">{selectedDay}</p>
                    </div>
                    <p className={`text-2xl font-bold ${dailySummary.percentage < 75 ? "text-red-400" : "text-cyan-400"}`}>{dailySummary.percentage}%</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Percentage</p>
                      <p className="text-xs text-muted-foreground">{selectedMonth}</p>
                    </div>
                    <p className={`text-2xl font-bold ${monthlySummary.percentage < 75 ? "text-red-400" : "text-emerald-400"}`}>{monthlySummary.percentage}%</p>
                  </div>
                </CardContent>
              </Card>
            </div>)}

          {/* Stats Summary */}
          {mode === "view" && scopedRecords.length > 0 && (<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(statusConfig).map(([status, cfg]) => {
                    const count = scopedRecords.filter((r) => r.status === status).length;
                    const Icon = cfg.icon;
                    return (<Card key={status} className={`border ${cfg.bgColor}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Icon className="w-5 h-5 shrink-0"/>
                      <div>
                        <p className="text-xs opacity-70">{cfg.label}</p>
                        <p className="text-xl font-bold">{count}</p>
                        <p className="text-xs opacity-60">{scopedRecords.length > 0 ? Math.round((count / scopedRecords.length) * 100) : 0}%</p>
                      </div>
                    </CardContent>
                  </Card>);
                })}
            </div>)}

          {/* Records List */}
          {mode === "view" && (<Card className="glass-card border-t-2 border-t-cyan-500/30">
              <CardHeader><CardTitle className="text-base font-serif">Attendance Records Â· {scopedRecords.length}</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (<div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full"/>))}</div>) : scopedRecords.length === 0 ? (<div className="text-center py-12 text-muted-foreground">
                {isTeacher ? "No records for selected filters. Select a class and use 'Bulk Attendance' to get started." : "No attendance records found."}
                  </div>) : (<div className="space-y-2">
                    {scopedRecords.map((record) => {
                        const cfg = statusConfig[record.status] ?? statusConfig.present;
                        const Icon = cfg.icon;
                        const studentRecords = scopedRecords.filter(r => r.studentId === record.studentId);
                        const rate = studentRecords.length > 0
                            ? (studentRecords.filter(r => r.status === "present" || r.status === "late").length / studentRecords.length) * 100
                            : 100;
                        const isDanger = rate < 75;
                        const isSelected = selectedRecord?.id === record.id;
                        const updateKey = `${record.studentId}:${record.classId}:${record.date}:${record.timetableSlotId ?? "daily"}`;
                        const isUpdated = !!updatedRecords[updateKey];
                        return (<div key={record.id} className="rounded-lg border border-border/50 overflow-hidden transition-all">
                          <div className={`flex items-center justify-between p-3 cursor-pointer hover:bg-cyan-500/5 transition-colors group ${isSelected ? "bg-cyan-500/8 border-l-2 border-l-cyan-400" : ""}`} onClick={() => setSelectedRecord(isSelected ? null : record)}>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={record.studentAvatarUrl} />
                                <AvatarFallback className={`text-xs font-semibold ${cfg.bgColor}`}>{(record.studentName || "S").charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className={`font-medium text-sm transition-colors ${isDanger ? "text-red-400 group-hover:text-red-300 font-semibold" : "group-hover:text-cyan-400"}`}>
                                  {record.studentName || `Student ${record.studentId}`}
                                  {isDanger && (
                                    <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                                      {Math.round(rate)}%
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">{record.className || `Class ${record.classId}`} Â· {record.date}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              {isUpdated && <Badge className="text-xs border bg-amber-500/10 text-amber-400 border-amber-500/20">Updated</Badge>}
                              <Badge className={`text-xs border ${cfg.bgColor}`}>{cfg.label}</Badge>
                              <Button size="icon" variant="ghost" className={`h-7 w-7 ${isSelected ? "bg-cyan-500/15 text-cyan-400" : "hover:bg-cyan-500/10 hover:text-cyan-400"}`} onClick={() => setSelectedRecord(isSelected ? null : record)}>
                                <Eye className="h-3.5 w-3.5"/>
                              </Button>
                            </div>
                          </div>
                          {isSelected && (<div className="border-t border-cyan-500/20 bg-cyan-500/5 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Attendance Record</p>
                                <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" onClick={() => setSelectedRecord(null)}><X className="h-3 w-3"/></Button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Student</span><p className="font-medium">{record.studentName || `#${record.studentId}`}</p></div>
                                <div><span className="text-xs text-muted-foreground block">Class</span><p className="font-medium">{record.className || `Class ${record.classId}`}</p></div>
                                <div><span className="text-xs text-muted-foreground block">Date</span><p className="font-medium">{record.date}</p></div>
                                <div><span className="text-xs text-muted-foreground block">Status</span><div className="flex items-center gap-2 mt-0.5 flex-wrap"><Badge className={`text-xs border ${cfg.bgColor}`}>{cfg.label}</Badge>{isUpdated && <Badge className="text-xs border bg-amber-500/10 text-amber-400 border-amber-500/20">Updated</Badge>}</div></div>
                                {record.remarks && <div className="col-span-2 sm:col-span-4"><span className="text-xs text-muted-foreground block">Remarks</span><p className="font-medium italic">{record.remarks}</p></div>}
                              </div>
                            </div>)}
                        </div>);
                    })}
                  </div>)}
              </CardContent>
            </Card>)}
        </>)}

          {activeTab === "periodwise" && (<>
            <div className="flex flex-col sm:flex-row gap-3">
            {!isStudent && (<Select value={selectedClass || "all"} onValueChange={handleClassChange}>
                  <SelectTrigger className="sm:w-48"><SelectValue placeholder="All classes"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {periodClassOptions.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                  </SelectContent>
              </Select>)}
            <Input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelectedPeriod(""); setPeriodEntryMode("view"); setPeriodStatuses({}); setPeriodRemarks({}); }} className="sm:w-48"/>
            <Select value={selectedPeriod || "all"} onValueChange={(v) => {
                const nextPeriod = v === "all" ? "" : v;
                setSelectedPeriod(nextPeriod);
                const slot = periodSlots.find((item) => String(item.id) === nextPeriod);
                if (slot?.classId)
                    setSelectedClass(String(slot.classId));
                setPeriodEntryMode("view");
                setPeriodStatuses({});
                setPeriodRemarks({});
            }}>
              <SelectTrigger className="sm:w-72"><SelectValue placeholder={isTeacher ? "Select period" : "All periods"}/></SelectTrigger>
              <SelectContent>
                {!isTeacher && <SelectItem value="all">All periods</SelectItem>}
                {periodSlots.map((slot, index) => (<SelectItem key={slot.id} value={String(slot.id)}>
                    {getPeriodDisplayLabel(slot, index)} · {slot.startTime}-{slot.endTime} · {slot.subjectName} · {slot.className}
                  </SelectItem>))}
              </SelectContent>
            </Select>
            {isTeacher && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={periodEntryMode === "bulk" ? "default" : "outline"} onClick={() => {
                  if (!selectedClass || !selectedPeriod || periodwiseClassStudents.length === 0) {
                    toast({ title: "Select a class and period first" });
                    return;
                  }
                  const initial = {};
                  const remarks = {};
                  periodwiseClassStudents.forEach((student) => {
                    initial[student.id] = periodExistingByStudent[student.id]?.status ?? "present";
                    remarks[student.id] = periodExistingByStudent[student.id]?.remarks ?? "";
                  });
                  setPeriodEntryMode("bulk");
                  setPeriodStatuses(initial);
                  setPeriodRemarks(remarks);
                }} disabled={!selectedClass || !selectedPeriod || periodwiseClassStudents.length === 0} className="gap-2">
                  <Users className="w-4 h-4" />
                  Mark Period
                </Button>
              </div>
            )}
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border border-blue-500/20 bg-blue-500/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Daily Roll-up</p>
                      <p className="text-xs text-muted-foreground">{selectedDate}</p>
                    </div>
                    <p className={`text-2xl font-bold ${periodDailySummary.percentage < 75 ? "text-red-400" : "text-blue-400"}`}>{periodDailySummary.percentage}%</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Roll-up</p>
                      <p className="text-xs text-muted-foreground">{selectedMonth}</p>
                    </div>
                    <p className={`text-2xl font-bold ${periodMonthlySummary.percentage < 75 ? "text-red-400" : "text-emerald-400"}`}>{periodMonthlySummary.percentage}%</p>
                  </div>
                </CardContent>
              </Card>
          </div>

          {isTeacher && periodSlots.length === 0 && (<Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-4 text-sm text-amber-300">
                No assigned periods found for this date. Choose a date that matches the timetable day, or ask admin to assign a Class 6+ period to this teacher.
              </CardContent>
            </Card>)}

          {isTeacher && selectedClass && selectedPeriod && periodwiseClassStudents.length === 0 && (<Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-4 text-sm text-amber-300">
                This class has no students yet. Add students to the selected Class 6+ class before marking period attendance.
              </CardContent>
            </Card>)}

          {selectedClass && selectedPeriod && periodEntryMode === "view" && (<Card className="glass-card border-t-2 border-t-blue-500/30">
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  Period Attendance Records · {selectedSlot?.subjectName ?? "Selected Period"} · {selectedDate}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {periodLoading ? (<div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full"/>))}</div>) : periodwiseClassStudents.length === 0 ? (<div className="text-center py-10 text-muted-foreground">No students found for the selected class.</div>) : (<div className="space-y-2">
                    {periodwiseClassStudents.map((student) => {
                        const record = periodExistingByStudent[student.id];
                        const status = record?.status ?? "not_marked";
                        const cfg = periodStatusConfig[status] ?? null;
                        const isUpdated = !!updatedRecords[`${student.id}:${selectedClass}:${selectedDate}:${selectedPeriod}`];
                        return (<div key={student.id} className="rounded-lg border border-border/50 p-3 hover:bg-blue-500/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarImage src={student.avatarUrl}/>
                                  <AvatarFallback className="text-xs bg-muted">{student.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{student.name}</p>
                                  <p className="text-xs text-muted-foreground">{student.rollNumber}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {isUpdated && <Badge className="text-xs border bg-amber-500/10 text-amber-400 border-amber-500/20">Updated</Badge>}
                                {record ? (<Badge className={`text-xs border ${cfg?.bgColor ?? ""}`}>{cfg?.label ?? record.status}</Badge>) : (<Badge className="text-xs border bg-muted text-muted-foreground">Not marked</Badge>)}
                              </div>
                            </div>
                            {record?.remarks && <p className="text-xs text-muted-foreground mt-2 italic">{record.remarks}</p>}
                          </div>);
                    })}
                  </div>)}
              </CardContent>
            </Card>)}

                    {isTeacher && selectedClass && selectedPeriod && periodEntryMode === "bulk" && (<Card className="border-blue-500/20 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  {selectedSlot?.subjectName ?? "Selected Period"} · {selectedSlot?.startTime}-{selectedSlot?.endTime} · {selectedDate}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs" onClick={() => { const all = {}; periodwiseClassStudents.forEach(s => { all[s.id] = "present"; }); setPeriodStatuses(all); }}>All Present</Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-500/30 text-xs" onClick={() => { const all = {}; periodwiseClassStudents.forEach(s => { all[s.id] = "absent"; }); setPeriodStatuses(all); }}>All Absent</Button>
                  <Button size="sm" variant="outline" className="text-muted-foreground text-xs" onClick={() => setPeriodStatuses({})}>Clear</Button>
                </div>
                <div className="space-y-2">
                  {periodwiseClassStudents.map((student) => {
                        const status = periodStatuses[student.id] ?? periodExistingByStudent[student.id]?.status ?? "present";
                        const cfg = periodStatusConfig[status] ?? periodStatusConfig.present;
                        return (<div key={student.id} className={`grid grid-cols-1 md:grid-cols-[1fr_180px_220px] gap-3 items-center p-3 rounded-lg border ${cfg.bgColor}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage src={student.avatarUrl}/>
                              <AvatarFallback className="text-xs bg-muted">{student.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{student.name}</p>
                              <p className="text-xs text-muted-foreground">{student.rollNumber}</p>
                            </div>
                          </div>
                          <Select value={status} onValueChange={(v) => setPeriodStatuses((prev) => ({ ...prev, [student.id]: v }))}>
                            <SelectTrigger className="h-8 bg-background/70"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {Object.entries(periodStatusConfig).map(([key, value]) => (<SelectItem key={key} value={key}>{value.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                          <Input value={periodRemarks[student.id] ?? ""} onChange={(e) => setPeriodRemarks((prev) => ({ ...prev, [student.id]: e.target.value }))} placeholder="Remarks" className="h-8 bg-background/70"/>
                        </div>);
                    })}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setPeriodEntryMode("view"); setPeriodStatuses({}); setPeriodRemarks({}); }}>Cancel</Button>
                  <Button size="sm" onClick={savePeriodAttendance} disabled={periodSaving || Object.keys(periodStatuses).length === 0}>
                    {periodSaving ? "Saving..." : "Save Bulk"}
                  </Button>
                </div>
              </CardContent>
            </Card>)}

        </>)}

      {activeTab === "staff" && isAdmin && (<>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input type="date" value={staffDate} onChange={(e) => setStaffDate(e.target.value)} className="sm:w-48"/>
            <Select value={staffDepartment || "all"} onValueChange={(v) => { setStaffDepartment(v === "all" ? "" : v); setStaffFilter(""); }}>
              <SelectTrigger className="sm:w-64"><SelectValue placeholder="Select department"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {staffDepartments.map((department) => (<SelectItem key={department} value={department}>{department}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={staffFilter || "all"} onValueChange={(v) => setStaffFilter(v === "all" ? "" : v)} disabled={!!staffDepartments.length && !staffDepartment}>
              <SelectTrigger className="sm:w-72"><SelectValue placeholder={staffDepartment ? "Select staff" : "Choose department first"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {(staffDepartment ? departmentStaff : allStaff).map((staff) => (
                  <SelectItem key={staff.id} value={String(staff.id)}>
                    {staff.name} · {staff.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card className="glass-card border-t-2 border-t-purple-500/30">
            <CardHeader><CardTitle className="text-base font-serif">Staff Attendance Records · {staffCheckinRecords.length}</CardTitle></CardHeader>
            <CardContent>
              {staffLoading ? (<div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full"/>))}</div>) : staffCheckinRecords.length === 0 ? (<div className="text-center py-12 text-muted-foreground">No staff check-in or attendance records found for the selected filters.</div>) : (<div className="space-y-2">
                  {staffCheckinRecords.map((record) => {
                        const checkedIn = !!record.checkInTime;
                        const checkedOut = !!record.checkOutTime;
                        return (<div key={`${record.source ?? "staff"}-${record.id}`} className="rounded-lg border border-border/50 p-3 hover:bg-purple-500/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{record.staffName || `Staff ${record.staffId}`}</p>
                                <p className="text-xs text-muted-foreground">{record.staffDepartment || staffDepartment || "Department"} · {record.staffRole || "staff"} · {record.date}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {checkedIn && record.checkInTime ? ` · In ${new Date(record.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                                  {checkedOut && record.checkOutTime ? ` · Out ${new Date(record.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={checkedOut ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : checkedIn ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-muted text-muted-foreground"}>
                                  {checkedOut ? "Checked Out" : checkedIn ? "Checked In" : record.status || "Pending"}
                                </Badge>
                              </div>
                            </div>
                            {(record.checkInReason || record.checkOutReason) && (
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {record.checkInReason && <p><span className="font-medium text-amber-400">Late check-in reason:</span> {record.checkInReason}</p>}
                                {record.checkOutReason && <p><span className="font-medium text-rose-400">Early checkout reason:</span> {record.checkOutReason}</p>}
                              </div>
                            )}
                          </div>);
                    })}
                </div>)}
            </CardContent>
          </Card>
        </>)}
      {/* â”€â”€â”€ BEHAVIOR LOG TAB â”€â”€â”€ */}
      {activeTab === "behavior" && (<>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <Select value={behaviorFilterClass || "all"} onValueChange={handleBehaviorFilterClassChange}>
              <SelectTrigger className="w-full lg:w-56"><SelectValue placeholder="Filter by class (all)"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={behaviorFilterStudent || "all"} onValueChange={handleBehaviorFilterStudentChange} disabled={!behaviorFilterClass}>
              <SelectTrigger className="w-full lg:w-60"><SelectValue placeholder={behaviorFilterClass ? "Filter by student (all)" : "Select class first"}/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All students</SelectItem>
                {behaviorFilterStudents.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => loadBehaviorLogs({ classId: behaviorFilterClass || undefined, studentId: behaviorFilterStudent || undefined })}>Refresh</Button>
          </div>

          {behaviorLoading ? (<div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-20 w-full"/>))}</div>) : displayedBehaviorLogs.length === 0 ? (<Card><CardContent className="py-12 text-center text-muted-foreground">No behavior logs yet. Use "Log Behavior" to add the first entry.</CardContent></Card>) : (<div className="space-y-3">
              {displayedBehaviorLogs.map((log) => {
                    const cfg = behaviorTypeConfig[log.type] ?? behaviorTypeConfig.neutral;
                    const BIcon = cfg.icon;
                    return (<Card key={log.id} className={`border-l-4 ${log.type === "positive" ? "border-l-emerald-500" : log.type === "negative" ? "border-l-red-500" : "border-l-blue-500"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-full ${cfg.color}`}><BIcon className="w-3.5 h-3.5"/></span>
                          <div>
                            <p className="font-medium text-sm">{log.studentName ?? `Student #${log.studentId}`}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{getBehaviorLogClassLabel(log) ? `Class: ${getBehaviorLogClassLabel(log)}` : "Class: Unknown"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.points !== undefined && log.points !== null && (<span className={`text-xs font-bold ${log.points > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {log.points > 0 ? "+" : ""}{log.points} pts
                            </span>)}
                          <Badge className={`text-xs capitalize ${cfg.color} border-0`}>{log.type}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 pl-8">{log.description}</p>
                    </CardContent>
                  </Card>);
                })}
            </div>)}
        </>)}
    </div>);
}
