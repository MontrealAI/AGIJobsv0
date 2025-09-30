{{- define "bundler.fullname" -}}
{{- printf "%s-%s" .Release.Name "bundler" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
