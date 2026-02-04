import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Target, TrendingUp, Edit, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoals, useCreateGoal, useOrganizations } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const goalSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  year: z.string().min(1, "El año es requerido"),
  targetValue: z.string().min(1, "El valor objetivo es requerido"),
  organizationId: z.string().optional(),
});

type GoalFormValues = z.infer<typeof goalSchema>;

export default function GoalsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [activeTab, setActiveTab] = useState("barrio");
  const [location] = useLocation();

  const { user } = useAuth();

  // Initialize tab from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "organizacion") {
      setActiveTab("organizacion");
    }
  }, []);
  const { data: goals = [], isLoading } = useGoals();
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateGoal();
  const { toast } = useToast();

  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const canCreateGoal = isObispado || isOrgMember;
  
  // For obispado: can create both ward and org goals
  // For org members: can only create goals for their organization
  const canCreateWardGoals = isObispado;
  const canCreateOrgGoals = isObispado || isOrgMember;
  
  // Separate ward and organization goals
  const wardGoals = goals.filter((g: any) => !g.organizationId);
  const orgGoals = isOrgMember 
    ? goals.filter((g: any) => g.organizationId === user?.organizationId)
    : goals.filter((g: any) => g.organizationId);
  
  // Use appropriate goals based on tab
  const filteredGoals = activeTab === "barrio" ? wardGoals : orgGoals;
  
  // Check if create button should be shown
  const showCreateButton = (activeTab === "barrio" && canCreateWardGoals) || (activeTab === "organizacion" && canCreateOrgGoals);

  const currentYear = new Date().getFullYear();

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      title: "",
      description: "",
      year: currentYear.toString(),
      targetValue: "",
      organizationId: "",
    },
  });

  const onSubmit = (data: GoalFormValues) => {
    // If user is org member, force organizationId to their own
    const organizationId = isOrgMember ? user?.organizationId : (data.organizationId || undefined);
    
    createMutation.mutate({
      title: data.title,
      description: data.description || "",
      year: parseInt(data.year),
      targetValue: parseInt(data.targetValue),
      currentValue: 0,
      organizationId: organizationId,
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const handleUpdateProgress = async (goalId: string) => {
    if (!newValue) return;

    try {
      await apiRequest("PUT", `/api/goals/${goalId}`, {
        currentValue: parseInt(newValue),
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      toast({
        title: "Progreso actualizado",
        description: "El progreso de la meta ha sido actualizado exitosamente.",
      });
      
      setEditingGoalId(null);
      setNewValue("");
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el progreso. Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await apiRequest("DELETE", `/api/goals/${goalId}`, {});
      
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      toast({
        title: "Meta eliminada",
        description: "La meta ha sido eliminada exitosamente.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la meta. Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const getOrganizationName = (orgId: string | null | undefined) => {
    if (!orgId) return "Barrio";
    const org = organizations.find((o: any) => o.id === orgId);
    if (!org) return "Organización";
    
    const nameMap: Record<string, string> = {
      "hombres_jovenes": "Cuórum del Sacerdocio Aarónico",
      "mujeres_jovenes": "Mujeres Jóvenes",
      "sociedad_socorro": "Sociedad de Socorro",
      "primaria": "Primaria",
      "escuela_dominical": "Escuela Dominical",
      "jas": "Liderazgo JAS",
      "cuorum_elderes": "Cuórum de Élderes",
    };
    
    return nameMap[org.type] || org.type;
  };

  const goalsWithPercentage = filteredGoals.map((goal: any) => ({
    ...goal,
    percentage: Math.round((goal.currentValue / goal.targetValue) * 100),
  }));

  const overallProgress = goalsWithPercentage.length > 0
    ? Math.round(
        goalsWithPercentage.reduce((sum: number, g: any) => sum + g.percentage, 0) /
          goalsWithPercentage.length
      )
    : 0;

  const completedGoals = goalsWithPercentage.filter((g: any) => g.percentage >= 100).length;

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Metas Anuales</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "barrio"
              ? "Seguimiento del progreso de las metas del barrio"
              : "Metas de tu organización"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          {showCreateButton && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-goal">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Meta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Nueva Meta</DialogTitle>
                  <DialogDescription>
                    {isOrgMember
                      ? "Define una nueva meta para tu organización"
                      : "Define una nueva meta para el barrio o una organización"}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título de la Meta</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: Aumentar asistencia sacramental"
                              {...field}
                              data-testid="input-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Detalles adicionales sobre la meta"
                              {...field}
                              data-testid="textarea-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Año</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} data-testid="input-year" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="targetValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor Objetivo</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="100"
                                {...field}
                                data-testid="input-target-value"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!isOrgMember && (
                      <FormField
                        control={form.control}
                        name="organizationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organización (Opcional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-organization">
                                  <SelectValue placeholder="Barrio completo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {organizations.map((org: any) => (
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
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                        data-testid="button-cancel"
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creando..." : "Crear Meta"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs for Ward vs Organization Goals */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="barrio" data-testid="tab-ward-goals">
            Metas del Barrio
          </TabsTrigger>
          {!isOrgMember && (
            <TabsTrigger value="organizacion" data-testid="tab-org-goals">
              Metas de Organizaciones
            </TabsTrigger>
          )}
          {isOrgMember && (
            <TabsTrigger value="organizacion" data-testid="tab-org-goals">
              Mi Organización
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progreso General</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2" data-testid="text-overall-progress">
              {overallProgress}%
            </div>
            <Progress value={overallProgress} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Metas Completadas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-goals">
              {completedGoals} / {goalsWithPercentage.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {goalsWithPercentage.length > 0
                ? `${Math.round((completedGoals / goalsWithPercentage.length) * 100)}% del total`
                : "Sin metas"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {goalsWithPercentage.length > 0 ? (
          goalsWithPercentage.map((goal: any) => (
            <Card key={goal.id} className="hover-elevate" data-testid={`card-goal-${goal.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{goal.title}</CardTitle>
                    {goal.description && (
                      <CardDescription className="mt-1">
                        {goal.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{goal.year}</Badge>
                    <Badge variant="secondary" data-testid={`badge-org-${goal.id}`}>
                      {getOrganizationName(goal.organizationId)}
                    </Badge>
                    {(isObispado || (isOrgMember && goal.organizationId === user?.organizationId)) && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteGoal(goal.id)}
                          data-testid={`button-delete-goal-${goal.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {goal.currentValue} / {goal.targetValue}
                    </span>
                    <span className="font-bold">{goal.percentage}%</span>
                  </div>
                  <Progress value={goal.percentage} className="h-3" />
                  {(isObispado || (isOrgMember && goal.organizationId)) && (
                    <div className="flex items-center gap-2 pt-2">
                      {editingGoalId === goal.id ? (
                        <>
                          <Input
                            type="number"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder={`Progreso actual: ${goal.currentValue}`}
                            className="flex-1"
                            data-testid={`input-progress-${goal.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleUpdateProgress(goal.id)}
                            data-testid={`button-save-${goal.id}`}
                          >
                            Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingGoalId(null);
                              setNewValue("");
                            }}
                            data-testid={`button-cancel-${goal.id}`}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingGoalId(goal.id);
                            setNewValue(goal.currentValue.toString());
                          }}
                          data-testid={`button-edit-${goal.id}`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Actualizar Progreso
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay metas definidas para este año
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
