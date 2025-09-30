{{- define "attester.fullname" -}}
{{- printf "%s-attester" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "attester.labels" -}}
app.kubernetes.io/name: attester
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: attester
app.kubernetes.io/managed-by: Helm
{{- end -}}
