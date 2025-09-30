{{- define "paymaster-supervisor.fullname" -}}
{{- printf "%s-paymaster-supervisor" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "paymaster-supervisor.labels" -}}
app.kubernetes.io/name: paymaster-supervisor
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: paymaster-supervisor
app.kubernetes.io/managed-by: Helm
{{- end -}}
