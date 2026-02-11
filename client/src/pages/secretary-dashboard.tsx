import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrganizations, useOrganizationAttendance, useUpsertOrganizationAttendance } from "@/hooks/use-api";

const attendanceSchema = z.object({
  organizationId: z.string().min(1, "La organización es requerida"),
  weekStartDate: z.string().min(1, "La fecha de semana es requerida"),
  attendeesCount: z.coerce.number().int().min(0, "Debe ser 0 o mayor"),
});

type AttendanceFormValues = z.infer<typeof attendanceSchema>;

export default function SecretaryDashboardPage() {
  const { data: organizations = [] } = useOrganizations();
  const { data: attendance = [] } = useOrganizationAttendance();
  const upsertAttendanceMutation = useUpsertOrganizationAttendance();
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const form = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      organizationId: "",
      weekStartDate: "",
      attendeesCount: 0,
    },
  });

  const attendanceByOrg = useMemo(() => {
    const map = new Map<string, number>();
    attendance.forEach((entry: any) => {
      const current = map.get(entry.organizationId) ?? 0;
      map.set(entry.organizationId, current + Number(entry.attendeesCount ?? 0));
    });
    return map;
  }, [attendance]);


  const weeklyRecords = useMemo(() => {
    return attendance
      .filter((entry: any) => selectedOrg === "all" || entry.organizationId === selectedOrg)
      .filter((entry: any) => {
        const d = new Date(entry.weekStartDate);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      })
      .sort((a: any, b: any) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());
  }, [attendance, selectedMonth, selectedOrg, selectedYear]);

  const monthlySummary = useMemo(() => {
    const present = weeklyRecords.reduce((acc: number, row: any) => acc + Number(row.attendeesCount ?? 0), 0);
    const capacity = weeklyRecords.reduce((acc: number, row: any) => acc + Math.max(0, Number(row.totalMembers ?? 0)), 0);
    const percent = capacity > 0 ? Math.min(100, (present / capacity) * 100) : 0;
    return { present, capacity, percent };
  }, [weeklyRecords]);

  const onSubmit = (values: AttendanceFormValues) => {
    upsertAttendanceMutation.mutate(values, {
      onSuccess: () => {
        form.reset({ ...values, attendeesCount: 0 });
      },
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 xl:p-8">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Panel de Secretaría</CardTitle>
          <CardDescription>Registros de asistencia semanal por organización</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-4">
              <FormField
                control={form.control}
                name="organizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organización</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="secretary-select-organization">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizations
                          .filter((org: any) => org.type !== "obispado")
                          .map((org: any) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weekStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semana (inicio)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="secretary-input-week-start" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attendeesCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asistentes</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} data-testid="secretary-input-attendees" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-end">
                <Button type="submit" className="w-full" data-testid="secretary-button-save-attendance" disabled={upsertAttendanceMutation.isPending}>
                  {upsertAttendanceMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Totales de asistencias por organización</CardTitle>
          <CardDescription>Acumulado de registros semanales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {organizations
            .filter((org: any) => org.type !== "obispado")
            .map((org: any) => (
              <div key={org.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <span className="text-sm">{org.name}</span>
                <span className="text-sm font-semibold">{attendanceByOrg.get(org.id) ?? 0}</span>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Asistencia semanal para Secretaría</CardTitle>
          <CardDescription>Histórico por domingo de cada mes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Organización</p>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger data-testid="secretary-filter-organization"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {organizations.filter((org: any) => org.type !== "obispado").map((org: any) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Mes</p>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger data-testid="secretary-filter-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, index) => (
                    <SelectItem key={index} value={String(index)}>{new Date(2024, index, 1).toLocaleDateString("es-ES", { month: "long" })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Año</p>
              <Input type="number" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value) || new Date().getFullYear())} data-testid="secretary-filter-year" />
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
            <p>
              Resumen del mes: <span className="font-semibold">{monthlySummary.present}/{monthlySummary.capacity || 0}</span> · {Math.round(monthlySummary.percent)}%
            </p>
          </div>

          <div className="space-y-2">
            {weeklyRecords.length > 0 ? weeklyRecords.map((entry: any) => (
              <div key={entry.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-border/70 px-3 py-2">
                <span className="text-sm font-medium">{new Date(entry.weekStartDate).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short" })}</span>
                <span className="text-sm">{Number(entry.attendeesCount ?? 0)}/{Number(entry.totalMembers ?? 0)}</span>
                <Badge variant="secondary">{Math.round((Number(entry.totalMembers ?? 0) > 0 ? (Number(entry.attendeesCount ?? 0) / Number(entry.totalMembers)) * 100 : 0))}%</Badge>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No hay asistencias registradas para este período.</p>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
