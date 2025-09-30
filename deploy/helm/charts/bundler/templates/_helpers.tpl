{{- define "bundler.fullname" -}}
{{- printf "%s-bundler" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "bundler.labels" -}}
app.kubernetes.io/name: bundler
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: bundler
app.kubernetes.io/managed-by: Helm
{{- end -}}
