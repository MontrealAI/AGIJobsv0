{{- define "postgres.fullname" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "postgres.labels" -}}
app.kubernetes.io/name: postgres
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: postgres
app.kubernetes.io/managed-by: Helm
{{- end -}}
