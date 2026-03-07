export function normalizeFeatureName(name: string): string {
	return name
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "")
		.replace(/-{2,}/g, "-");
}

export function validateFeatureNameInput(value: string): string | undefined {
	if (!value.trim()) {
		return "Feature name is required";
	}

	if (!normalizeFeatureName(value)) {
		return "Feature name must include letters or numbers";
	}

	return undefined;
}
