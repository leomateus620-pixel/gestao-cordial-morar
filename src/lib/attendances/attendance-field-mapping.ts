type PropertyFieldInput = {
  propertyId?: string | null;
  propertyCode?: string | null;
  propertyTitle?: string | null;
  interestDescription?: string | null;
};

export type CanonicalPropertyFields = {
  propertyId?: string;
  propertyCode?: string;
  propertyTitle?: string;
  interestDescription?: string;
};

export function mapCanonicalPropertyFields(input: PropertyFieldInput): CanonicalPropertyFields {
  const propertyId = optionalText(input.propertyId);
  const explicitInterest = optionalText(input.interestDescription);

  if (!propertyId) {
    return {
      interestDescription: explicitInterest ?? optionalText(input.propertyTitle),
    };
  }

  return {
    propertyId,
    propertyCode: optionalText(input.propertyCode),
    propertyTitle: optionalText(input.propertyTitle),
    interestDescription: explicitInterest,
  };
}

function optionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
