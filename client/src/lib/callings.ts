export const formatCallingLabel = (
  callingName?: string | null,
  organizationName?: string | null
) => {
  if (!callingName) return "";
  if (!organizationName) return callingName;
  return `${callingName} de ${organizationName}`;
};

