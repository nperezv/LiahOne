import { useMemo, useState } from "react";
import { Cake, Send, Mail, Phone, ArrowLeft, CalendarDays } from "lucide-react";

// Random birthday greetings and images
const BIRTHDAY_PHRASES = [
  "¡Feliz cumpleaños! Que este día sea lleno de alegría y bendiciones.",
  "¡Que tengas un día maravilloso! Muchas bendiciones en tu cumpleaños.",
  "¡Feliz cumpleaños! Que el Señor te guíe en este nuevo año de vida.",
  "¡Un día especial para una persona especial! ¡Feliz cumpleaños!",
  "Que este cumpleaños marque el inicio de un año lleno de éxitos.",
  "¡Feliz cumpleaños! Que disfrutes de cada momento al máximo.",
  "Que Dios te bendiga en este día y siempre. ¡Feliz cumpleaños!",
  "¡Hoy es tu día! Que sea memorable y lleno de alegría.",
  "¡Feliz cumpleaños! Agradecemos tu fe y dedicación al barrio.",
  "Que este año traiga salud, felicidad y muchas bendiciones.",
];

const BIRTHDAY_IMAGES = [
  "🎉", "🎂", "🎈", "🌟", "💝", "🎊", "🎁", "✨", "🎀", "🎭"
];

const BIRTHDAY_IMAGE_LIBRARY = [
  {
    label: "Globos y pastel",
    url: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=80",
  },
  {
    label: "Pastel con velas",
    url: "https://images.unsplash.com/photo-1516455207990-7a41ce80f7ee?auto=format&fit=crop&w=800&q=80",
  },
  {
    label: "Confeti festivo",
    url: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=800&q=80",
  },
  {
    label: "Regalos coloridos",
    url: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=800&q=80",
  },
];

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useBirthdays } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { formatBirthdayMonthDay, getAgeTurningOnNextBirthday, getDaysUntilBirthday, getNextBirthdayDate } from "@shared/birthday-utils";
import { useToast } from "@/hooks/use-toast";
import { shortMemberName } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }
  navigate(path);
};

export default function BirthdaysPage() {
  const [showOnly30Days, setShowOnly30Days] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState<any | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("random");
  const [selectedImage, setSelectedImage] = useState("random");

  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const origin = searchParams.get("from");
  const originOrgSlug = searchParams.get("orgSlug");
  const originOrgId = searchParams.get("orgId");
  const isPresidencyOrigin = (origin === "presidency-manage" || origin === "presidency-panel") && Boolean(originOrgSlug);
  const shouldFilterByOriginOrganization = isPresidencyOrigin && Boolean(originOrgId);

  const { data: birthdays = [], isLoading } = useBirthdays();
  const { toast } = useToast();

  const calculateDaysUntil = (birthDate: string) => getDaysUntilBirthday(birthDate);

  const visibleBirthdays = shouldFilterByOriginOrganization
    ? birthdays.filter((b: any) => b.organizationId === originOrgId)
    : birthdays;

  const thisYear = new Date().getFullYear();
  const birthdaysWithDays = visibleBirthdays.map((b: any) => {
    const daysUntil = calculateDaysUntil(b.birthDate);
    const nextBirthdayYear = getNextBirthdayDate(b.birthDate).getFullYear();
    return {
      ...b,
      displayName: shortMemberName(b),
      daysUntil,
      nextAge: getAgeTurningOnNextBirthday(b.birthDate),
      isNextYear: nextBirthdayYear > thisYear,
    };
  });

  const allBirthdaysSorted = birthdaysWithDays.sort(
    (a: any, b: any) => a.daysUntil - b.daysUntil
  );

  const upcomingBirthdays = (showOnly30Days
    ? allBirthdaysSorted.filter((b: any) => b.daysUntil <= 30)
    : allBirthdaysSorted).filter((b: any) => b.daysUntil > 0);

  const todaysBirthdays = birthdaysWithDays.filter((b: any) => b.daysUntil === 0);

  const getRandomGreeting = (name: string) => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      phrase: BIRTHDAY_PHRASES[hash % BIRTHDAY_PHRASES.length],
      image: BIRTHDAY_IMAGES[hash % BIRTHDAY_IMAGES.length],
    };
  };

  const getRandomImageUrl = (name: string) => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return BIRTHDAY_IMAGE_LIBRARY[hash % BIRTHDAY_IMAGE_LIBRARY.length];
  };

  const openSendDialog = (birthday: any) => {
    if (!birthday?.phone && !birthday?.email) {
      toast({
        title: "Sin contacto",
        description: "Este miembro no tiene teléfono ni email registrado.",
        variant: "destructive",
      });
      return;
    }
    setSelectedBirthday(birthday);
    setSelectedTemplate("random");
    setSelectedImage("random");
    setIsSendDialogOpen(true);
  };

  const buildBirthdayMessage = (birthday: any) => {
    const name = birthday.displayName || birthday.name;
    const randomGreeting = getRandomGreeting(name);
    const phrase = selectedTemplate === "random"
      ? randomGreeting.phrase
      : BIRTHDAY_PHRASES[Number(selectedTemplate)];
    const imageEmoji = selectedTemplate === "random"
      ? randomGreeting.image
      : BIRTHDAY_IMAGES[Number(selectedTemplate) % BIRTHDAY_IMAGES.length];
    const imageSelection = selectedImage === "random"
      ? getRandomImageUrl(name)
      : BIRTHDAY_IMAGE_LIBRARY[Number(selectedImage)];
    return [
      `¡Hola ${name}!`,
      `${imageEmoji} ${phrase}`,
      "",
      "Mira esta imagen de cumpleaños:",
      imageSelection.url,
    ].join("\n");
  };

  const handleSendGreeting = () => {
    if (!selectedBirthday) return;
    const message = buildBirthdayMessage(selectedBirthday);
    if (selectedBirthday.phone) {
      const digits = selectedBirthday.phone.replace(/[^\d]/g, "");
      if (!digits) {
        toast({ title: "Teléfono inválido", description: "No se encontró un número válido.", variant: "destructive" });
        return;
      }
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } else if (selectedBirthday.email) {
      window.open(`mailto:${selectedBirthday.email}?subject=${encodeURIComponent("¡Feliz cumpleaños!")}&body=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
    setIsSendDialogOpen(false);
    setSelectedBirthday(null);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Cumpleaños</h1>
          <p className="text-sm text-muted-foreground">
            Cumpleaños del directorio — envía felicitaciones
          </p>
        </div>
        {isPresidencyOrigin ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => navigateWithTransition(setLocation, origin === "presidency-manage" ? `/presidency/${originOrgSlug}/manage` : `/presidency/${originOrgSlug}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        ) : null}
      </div>

      {todaysBirthdays.length > 0 && (
        <div className="mb-6">
          <Card className="border-2 border-primary bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-5 w-5" />
                Cumpleaños de Hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todaysBirthdays.map((birthday: any) => {
                  const greeting = getRandomGreeting(birthday.displayName);
                  return (
                    <div
                      key={birthday.id}
                      className="flex items-start justify-between p-4 bg-white dark:bg-slate-900 rounded-md border-l-4 border-pink-500"
                      data-testid={`today-birthday-${birthday.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{greeting.image}</span>
                          <span className="font-bold text-lg">{birthday.displayName}</span>
                        </div>
                        <p className="text-sm text-pink-700 dark:text-pink-300 italic">{greeting.phrase}</p>
                      </div>
                      <Button size="sm" variant="default" onClick={() => openSendDialog(birthday)} data-testid={`button-greet-${birthday.id}`}>
                        <Send className="h-4 w-4 mr-1" />
                        Enviar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Todos los Cumpleaños</CardTitle>
            <CardDescription>
              {showOnly30Days ? "Mostrando próximos 30 días" : "Mostrando todos los cumpleaños"}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={showOnly30Days ? "default" : "outline"}
            onClick={() => setShowOnly30Days(!showOnly30Days)}
            data-testid="button-filter-30-days"
          >
            {showOnly30Days ? "Ver todos" : "Próximos 30 días"}
          </Button>
        </CardHeader>
        <CardContent>
          {upcomingBirthdays.length > 0 ? (
            <div className="space-y-3">
              {upcomingBirthdays.map((birthday: any) => (
                <div
                  key={birthday.id}
                  data-testid={`row-birthday-${birthday.id}`}
                  className="rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-semibold leading-tight">{birthday.displayName}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        <span>{formatBirthdayMonthDay(birthday.birthDate, "es-ES")}</span>
                        {typeof birthday.nextAge === "number" ? <span>· Cumple {birthday.nextAge}</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {birthday.isNextYear && (
                        <Badge variant="secondary" className="text-xs">{new Date().getFullYear() + 1}</Badge>
                      )}
                      <Badge variant={birthday.daysUntil === 0 ? "default" : "outline"}>
                        {birthday.daysUntil === 0 ? "Hoy" : birthday.daysUntil === 1 ? "Mañana" : `${birthday.daysUntil} días`}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(birthday.email || birthday.phone) && (
                      <Button size="sm" variant="outline" onClick={() => openSendDialog(birthday)} data-testid={`button-send-${birthday.id}`}>
                        {birthday.phone ? (
                          <><Send className="mr-1 h-4 w-4" />WhatsApp</>
                        ) : (
                          <><Mail className="mr-1 h-4 w-4" />Email</>
                        )}
                      </Button>
                    )}
                    {birthday.phone && (
                      <Button size="sm" variant="outline" asChild data-testid={`button-call-${birthday.id}`}>
                        <a href={`tel:${birthday.phone}`}>
                          <Phone className="mr-1 h-4 w-4" />
                          Llamar
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">No hay cumpleaños próximos</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar felicitación</DialogTitle>
            <DialogDescription>
              Selecciona una plantilla y una imagen (o déjalo en aleatorio).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plantilla de mensaje</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger data-testid="select-birthday-template">
                  <SelectValue placeholder="Selecciona una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Aleatorio</SelectItem>
                  {BIRTHDAY_PHRASES.map((phrase, index) => (
                    <SelectItem key={phrase} value={String(index)}>{phrase}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Imagen de cumpleaños</Label>
              <Select value={selectedImage} onValueChange={setSelectedImage}>
                <SelectTrigger data-testid="select-birthday-image">
                  <SelectValue placeholder="Selecciona una imagen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Aleatorio</SelectItem>
                  {BIRTHDAY_IMAGE_LIBRARY.map((image, index) => (
                    <SelectItem key={image.url} value={String(index)}>{image.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedBirthday && (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Vista previa</p>
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {buildBirthdayMessage(selectedBirthday)}
                </pre>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsSendDialogOpen(false)} data-testid="button-cancel-send">
                Cancelar
              </Button>
              <Button type="button" onClick={handleSendGreeting} data-testid="button-confirm-send">
                Enviar felicitación
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
